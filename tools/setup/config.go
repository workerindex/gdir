package main

import (
	"flag"

	"github.com/cloudflare/cloudflare-go"
	"github.com/google/go-github/v31/github"
)

var args = struct {
	ConfigFile        string `json:"-"`
	CloudflareEmail   string `json:"cf_email,omitempty"`
	CloudflareKey     string `json:"cf_key,omitempty"`
	CloudflareAccount string `json:"cf_account,omitempty"`
	CloudflareWorker  string `json:"cf_worker,omitempty"`
	GistToken         string `json:"gist_token,omitempty"`
	GistUser          string `json:"gist_user,omitempty"`
	GistID            struct {
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
}{}

var cf *cloudflare.API
var gh *github.Client

type user struct {
	Name            string   `json:"name"`
	Pass            string   `json:"pass"`
	DrivesWhiteList []string `json:"drives_white_list,omitempty"`
	DrivesBlackList []string `json:"drives_black_list,omitempty"`
}

func init() {
	flag.StringVar(&args.ConfigFile, "config", "config.json", "config file to read and write")
	flag.StringVar(&args.CloudflareEmail, "cf-email", "", "Cloudflare login Email")
	flag.StringVar(&args.CloudflareKey, "cf-key", "", "Cloudflare Key")
	flag.StringVar(&args.CloudflareAccount, "cf-account", "", "Cloudflare account")
	flag.StringVar(&args.CloudflareWorker, "cf-worker", "", "Cloudflare Worker script ID to deploy to")
	flag.StringVar(&args.GistToken, "gist-token", "", "GitHub Token with gist scope")
	flag.StringVar(&args.GistID.Accounts, "accounts-gist", "", "Gist ID for accounts")
	flag.StringVar(&args.GistID.Users, "users-gist", "", "Gist ID for users")
	flag.StringVar(&args.GistID.Static, "static-gist", "", "Gist ID for static files")
	flag.StringVar(&args.SecretKey, "key", "", "gdir master secret key to derive other encryption keys")
	flag.StringVar(&args.AccountRotationStr, "account-rotation", "", "number of seconds to rotate the next list of account candidates (default 60)")
	flag.StringVar(&args.AccountCandidatesStr, "account-candidates", "", "number of accounts to be selected as candidates at each rotation (default 10)")
	flag.StringVar(&args.AccountsJSONDir, "accounts-json-dir", "", "AutoRclone generated accounts directory with JSON files")
}
