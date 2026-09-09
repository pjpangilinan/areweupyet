package apipublic

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/aws/aws-lambda-go/events"
)

// HandleLambdaRequest bridges LambdaFunctionURLRequest into http.Handler for public routes.
func HandleLambdaRequest(ctx context.Context, handler http.Handler, req events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	method := req.RequestContext.HTTP.Method
	path := req.RequestContext.HTTP.Path
	if path == "" {
		path = "/"
	}

	fullPath := path
	if req.RawQueryString != "" {
		fullPath += "?" + req.RawQueryString
	}

	var bodyReader io.Reader
	if req.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(req.Body)
		if err == nil {
			bodyReader = bytes.NewReader(decoded)
		} else {
			bodyReader = strings.NewReader(req.Body)
		}
	} else {
		bodyReader = strings.NewReader(req.Body)
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, fullPath, bodyReader)
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
