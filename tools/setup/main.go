package main

import (
	"flag"
	"fmt"
	"log"

	"github.com/workerindex/gdir/tools/core"
)

func run() (err error) {
	flag.Parse()

	fmt.Println("                                                                   ")
	fmt.Println("                                  _ _                              ")
	fmt.Println("                          __ _ __| (_)_ _                          ")
	fmt.Println("                         / _` / _` | | '_|                         ")
	fmt.Println(`                         \__, \__,_|_|_|                           `)
	fmt.Println("                         |___/                                     ")
	fmt.Println("                                                                   ")

	if err = core.LoadConfigFile(); err != nil {
		return
	}

	if err = core.EnterCloudflareEmail(); err != nil {
		return
	}

	if err = core.EnterCloudflareKey(); err != nil {
		return
	}

	if err = core.InitCloudflareAPI(); err != nil {
		return
	}

	if err = core.SelectCloudflareAccount(); err != nil {
		return
	}

	if err = core.SelectWorker(); err != nil {
		return
	}

	if err = core.EnterGistToken(); err != nil {
		return
	}

	if err = core.InitGitHubAPI(); err != nil {
		return
	}

	if err = core.EnterAccoutsGist("Accounts", &core.Config.GistID.Accounts); err != nil {
		return
	}

	if err = core.EnterAccoutsGist("Users", &core.Config.GistID.Users); err != nil {
		return
	}

	if err = core.EnterAccoutsGist("Static", &core.Config.GistID.Static); err != nil {
		return
	}

	if err = core.GetGistUser(); err != nil {
		return
	}

	if err = core.ConfigureSecretKey(); err != nil {
		return
	}

	if err = core.ConfigureAccountRotation(); err != nil {
		return
	}

	if err = core.ConfigureAccountCandidates(); err != nil {
		return
	}

	if err = core.EnterAccountsJSONDir(); err != nil {
		return
	}

	if err = core.ProcessAccountsJSONDir(); err != nil {
		return
	}

	if err = core.ConfigureAdminUser(); err != nil {
		return
	}

	if err = core.DeployGist("accounts", core.Config.GistID.Accounts); err != nil {
		return
	}

	if err = core.DeployGist("users", core.Config.GistID.Users); err != nil {
		return
	}

	if err = core.DeployGist("static", core.Config.GistID.Static); err != nil {
		return
	}

	if err = core.DeployWorker(); err != nil {
		return
	}

	return
}

func init() {
	flag.StringVar(&core.Config.ConfigFile, "config", "config.json", "config file to read and write")
	flag.StringVar(&core.Config.CloudflareEmail, "cf-email", "", "Cloudflare login Email")
	flag.StringVar(&core.Config.CloudflareKey, "cf-key", "", "Cloudflare Key")
	flag.StringVar(&core.Config.CloudflareAccount, "cf-account", "", "Cloudflare account")
	flag.StringVar(&core.Config.CloudflareWorker, "cf-worker", "", "Cloudflare Worker script ID to deploy to")
	flag.StringVar(&core.Config.GistToken, "gist-token", "", "GitHub Token with gist scope")
	flag.StringVar(&core.Config.GistID.Accounts, "accounts-gist", "", "Gist ID for accounts")
	flag.StringVar(&core.Config.GistID.Users, "users-gist", "", "Gist ID for users")
	flag.StringVar(&core.Config.GistID.Static, "static-gist", "", "Gist ID for static files")
	flag.StringVar(&core.Config.SecretKey, "key", "", "gdir master secret key to derive other encryption keys")
	flag.StringVar(&core.Config.AccountRotationStr, "account-rotation", "", "number of seconds to rotate the next list of account candidates (default 60)")
	flag.StringVar(&core.Config.AccountCandidatesStr, "account-candidates", "", "number of accounts to be selected as candidates at each rotation (default 10)")
	flag.StringVar(&core.Config.AccountsJSONDir, "accounts-json-dir", "", "AutoRclone generated accounts directory with JSON files")
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
