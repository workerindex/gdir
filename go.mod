module github.com/workerindex/gdir

go 1.14

require (
	github.com/cloudflare/cloudflare-go v0.11.6
	github.com/google/go-github/v31 v31.0.0
	golang.org/x/crypto v0.0.0-20190308221718-c2843e01d9a2
	golang.org/x/oauth2 v0.0.0-20180821212333-d2e6202438be
)

replace github.com/cloudflare/cloudflare-go => github.com/workerindex/cloudflare-go v0.11.8-0.20200526000000-4d963825dfa3
