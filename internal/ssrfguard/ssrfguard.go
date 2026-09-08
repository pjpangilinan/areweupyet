package ssrfguard

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"syscall"
	"time"
)

var (
	ErrBlockedIP      = errors.New("destination IP blocked: private, loopback, or metadata address")
	ErrInvalidScheme  = errors.New("invalid URL scheme: must be http or https")
	ErrRedirectFailed = errors.New("redirect target violates security policy")
)

// blockedCIDRs defines non-routable, private, link-local, and cloud metadata ranges.
var blockedCIDRs = []string{
	"0.0.0.0/8",          // Current network
	"10.0.0.0/8",         // Private network
	"100.64.0.0/10",      // Carrier-grade NAT
	"127.0.0.0/8",        // Loopback
	"169.254.0.0/16",     // Link-local / Cloud metadata (e.g. 169.254.169.254)
	"172.16.0.0/12",      // Private network
	"192.0.0.0/24",       // IETF protocol assignments
	"192.0.2.0/24",       // TEST-NET-1
	"192.88.99.0/24",     // 6to4 relay anycast
	"192.168.0.0/16",     // Private network
	"198.18.0.0/15",      // Network benchmark tests
	"198.51.100.0/24",    // TEST-NET-2
	"203.0.113.0/24",     // TEST-NET-3
	"224.0.0.0/4",        // Multicast
	"240.0.0.0/4",        // Reserved
	"::/128",             // Unspecified IPv6
	"::1/128",            // Loopback IPv6
	"fc00::/7",           // Unique local address IPv6
	"fe80::/10",          // Link-local IPv6
}

var parsedBlockedCIDRs []*net.IPNet

func init() {
	for _, cidr := range blockedCIDRs {
		_, block, err := net.ParseCIDR(cidr)
		if err == nil {
			parsedBlockedCIDRs = append(parsedBlockedCIDRs, block)
		}
	}
}

// IsBlockedIP checks if an IP is in the forbidden ranges.
func IsBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	for _, block := range parsedBlockedCIDRs {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

// ValidateTargetURL parses and validates the target URL for safe HTTP schemes and routable hosts.
func ValidateTargetURL(targetURL string) (*url.URL, error) {
	u, err := url.ParseRequestURI(targetURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, ErrInvalidScheme
	}

	host := u.Hostname()
	if host == "" {
		return nil, errors.New("host cannot be empty")
	}

	// If hostname is directly an IP, check immediately
	if ip := net.ParseIP(host); ip != nil {
		if IsBlockedIP(ip) {
			return nil, ErrBlockedIP
		}
		return u, nil
	}

	// Resolve hostname to ensure at least one valid IP exists
	ips, err := net.LookupIP(host)
	if err != nil {
		return nil, fmt.Errorf("hostname resolution failed: %w", err)
	}
	if len(ips) == 0 {
		return nil, errors.New("no IP addresses found for host")
	}

	for _, ip := range ips {
		if IsBlockedIP(ip) {
			return nil, fmt.Errorf("%w: %s resolves to forbidden IP %s", ErrBlockedIP, host, ip.String())
		}
	}

	return u, nil
}

// SafeHTTPClient returns an http.Client with connect-time IP verification and redirect checks.
func SafeHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   timeout,
		KeepAlive: 30 * time.Second,
		Control: func(network, address string, c syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			ip := net.ParseIP(host)
			if ip != nil && IsBlockedIP(ip) {
				return ErrBlockedIP
			}
			return nil
		},
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil {
				return nil, err
			}
			var validIP net.IP
			for _, ip := range ips {
				if !IsBlockedIP(ip) {
					validIP = ip
					break
				}
			}
			if validIP == nil {
				return nil, ErrBlockedIP
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(validIP.String(), port))
		},
		ResponseHeaderTimeout: timeout,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("stopped after 5 redirects")
			}
			if _, err := ValidateTargetURL(req.URL.String()); err != nil {
				return fmt.Errorf("%w: %s", ErrRedirectFailed, err)
			}
			return nil
		},
	}
}
