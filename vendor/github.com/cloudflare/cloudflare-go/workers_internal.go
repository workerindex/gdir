package cloudflare

func (api *API) PublishWorker(scriptName string) (err error) {
	uri := "/accounts/" + api.AccountID + "/workers/scripts/" + scriptName + "/subdomain"
	_, err = api.makeRequest("POST", uri, &struct {
		Enabled bool `json:"enabled"`
	}{true})
	return
}
