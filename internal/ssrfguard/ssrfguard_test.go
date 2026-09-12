package ssrfguard

import (
	"net"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsBlockedIP(t *testing.T) {
	tests := []struct {
		ip       string
		expected bool
	}{
		{"127.0.0.1", true},
		{"169.254.169.254", true}, // AWS metadata
		{"10.0.0.1", true},
		{"192.168.1.1", true},
		{"172.16.0.5", true},
		{"::1", true},
		{"::ffff:127.0.0.1", true},       // IPv4-mapped loopback
		{"::ffff:169.254.169.254", true}, // IPv4-mapped AWS metadata
		{"::ffff:8.8.8.8", false},        // IPv4-mapped public IP
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"142.250.190.46", false}, // Google public IP
	}

	for _, tt := range tests {
		ip := net.ParseIP(tt.ip)
		assert.Equal(t, tt.expected, IsBlockedIP(ip), "IP: %s", tt.ip)
	}
}

func TestValidateTargetURL(t *testing.T) {
	// Blocked URLs
	_, err := ValidateTargetURL("http://127.0.0.1/admin")
	assert.ErrorIs(t, err, ErrBlockedIP)

	_, err = ValidateTargetURL("http://169.254.169.254/latest/meta-data/")
	assert.ErrorIs(t, err, ErrBlockedIP)

	_, err = ValidateTargetURL("http://[::ffff:169.254.169.254]/latest/meta-data/")
	assert.ErrorIs(t, err, ErrBlockedIP)

	_, err = ValidateTargetURL("file:///etc/passwd")
	assert.ErrorIs(t, err, ErrInvalidScheme)

	_, err = ValidateTargetURL("ftp://example.com/test")
	assert.ErrorIs(t, err, ErrInvalidScheme)

	// Blocked ports
	_, err = ValidateTargetURL("http://example.com:25/mail")
	assert.ErrorIs(t, err, ErrBlockedPort)

	_, err = ValidateTargetURL("http://example.com:22/ssh")
	assert.ErrorIs(t, err, ErrBlockedPort)

	// Allowed ports
	u, err := ValidateTargetURL("http://1.1.1.1:8080/test")
	assert.NoError(t, err)
	assert.Equal(t, "1.1.1.1:8080", u.Host)
}
