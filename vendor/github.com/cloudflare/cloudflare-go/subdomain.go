package cloudflare

import (
	"encoding/json"

	"github.com/pkg/errors"
)

type SubdomainResult struct {
	Result *Subdomain `json:"result"`
}

type Subdomain struct {
	Subdomain string `json:"subdomain"`
}

func (api *API) subdomainURI() string {
	return "/accounts/" + api.AccountID + "/workers/subdomain"
}

func (api *API) GetSubdomain() (subdomain string, err error) {
	uri := api.subdomainURI()
	res, err := api.makeRequest("GET", uri, nil)
	if err != nil {
		err = errors.Wrap(err, errMakeRequestError)
		return
	}
	var result SubdomainResult
	if err = json.Unmarshal(res, &result); err != nil {
		return
	}
	if result.Result == nil {
		subdomain = ""
	} else {
		subdomain = result.Result.Subdomain
	}
	return
}

func (api *API) RegisterSubdomain(subdomain string) (err error) {
	uri := api.subdomainURI()
	_, err = api.makeRequest("PUT", uri, &Subdomain{subdomain})
	return
}
