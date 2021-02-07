package core

import (
    "github.com/cloudflare/cloudflare-go"
    "github.com/google/go-github/v31/github"
)

var Config = struct {
    ConfigFile          string `json:"-"`
    Proxy               string `json:"proxy,omitempty"`
    CloudflareEmail     string `json:"cf_email,omitempty"`
    CloudflareKey       string `json:"cf_key,omitempty"`
    CloudflareAccount   string `json:"cf_account,omitempty"`
    CloudflareSubdomain string `json:"-"`
    CloudflareWorker    string `json:"cf_worker,omitempty"`
    GistToken           string `json:"gist_token,omitempty"`
    GistUser            string `json:"gist_user,omitempty"`
    GistID              struct {
        Accounts string `json:"accounts,omitempty"`
        Users    string `json:"users,omitempty"`
        Static   string `json:"static,omitempty"`
    } `json:"gist_id,omitempty"`
    SecretKey            string `json:"secret_key,omitempty"`
    AccountRotation      uint64 `json:"account_rotation,omitempty"`
    AccountRotationStr   string `json:"-"`
    AccountCandidates    uint64 `json:"account_candidates,omitempty"`
    AccountCandidatesStr string `json:"-"`
    AccountsJSONDir      string `json:"accounts_json_dir,omitempty"`
    AccountsCount        uint64 `json:"accounts_count,omitempty"`
    Debug                bool   `json:"-"`
}{}

// Cf is the Cloudflare client
var Cf *cloudflare.API

// Gh is the GitHub client
var Gh *github.Client

// User is the user type
type User struct {
    Name            string   `json:"name"`
    Pass            string   `json:"pass"`
    DrivesAllowList []string `json:"drives_white_list,omitempty"`
    DrivesBlockList []string `json:"drives_black_list,omitempty"`
}
