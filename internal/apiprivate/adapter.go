package apiprivate

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/aws/aws-lambda-go/events"
)

// HandleLambdaRequest bridges LambdaFunctionURLRequest into http.Handler.
func HandleLambdaRequest(ctx context.Context, handler http.Handler, req events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	method := req.RequestContext.HTTP.Method
	path := req.RequestContext.HTTP.Path
	if path == "" {
		path = "/"
	}

	body := strings.NewReader(req.Body)
	httpReq, err := http.NewRequestWithContext(ctx, method, path, body)
	if err != nil {
		return events.LambdaFunctionURLResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       `{"error":"failed to construct request"}`,
		}, nil
	}

	// Copy headers
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	// 1. From IAM Authorizer (when Lambda Function URL uses AWS_IAM auth)
	if req.RequestContext.Authorizer != nil && req.RequestContext.Authorizer.IAM != nil {
		callerID := req.RequestContext.Authorizer.IAM.CallerID
		if callerID == "" {
			callerID = req.RequestContext.Authorizer.IAM.UserID
		}
		if callerID != "" {
			httpReq = httpReq.WithContext(context.WithValue(httpReq.Context(), "tenantId", callerID))
		}
	}

	// 2. From Authorization Bearer JWT (Cognito user pool token)
	authHeader := req.Headers["authorization"]
	if authHeader == "" {
		authHeader = req.Headers["Authorization"]
	}
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		token := strings.TrimSpace(authHeader[7:])
		if tenantID := extractSubFromJWT(token); tenantID != "" {
			httpReq = httpReq.WithContext(context.WithValue(httpReq.Context(), "tenantId", tenantID))
		}
	}

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httpReq)

	res := recorder.Result()
	defer res.Body.Close()

	resHeaders := make(map[string]string)
	for k := range res.Header {
		resHeaders[k] = res.Header.Get(k)
	}

	return events.LambdaFunctionURLResponse{
		StatusCode: res.StatusCode,
		Headers:    resHeaders,
		Body:       recorder.Body.String(),
	}, nil
}

// extractSubFromJWT extracts the "sub" claim from a JWT payload segment.
func extractSubFromJWT(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return ""
	}
	payloadSegment := parts[1]
	if rem := len(payloadSegment) % 4; rem != 0 {
		payloadSegment += strings.Repeat("=", 4-rem)
	}
	data, err := base64.URLEncoding.DecodeString(payloadSegment)
	if err != nil {
		data, err = base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			return ""
		}
	}
	var claims struct {
		Sub string `json:"sub"`
	}
	if err := json.Unmarshal(data, &claims); err != nil {
		return ""
	}
	return claims.Sub
}
