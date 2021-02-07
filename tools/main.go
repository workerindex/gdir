package main

import (
    "flag"
    "fmt"
    "log"
    "strings"

    "github.com/workerindex/gdir/tools/core"
)

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
	flag.BoolVar(&core.Config.Debug, "debug", false, "log debug messages")
}

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

	if !core.ValidateConfig() {
		if err = setup(); err != nil {
			return
		}
	} else {
		if err = menu(); err != nil {
			return
		}
	}
	return
}

func menu() (err error) {
	for {
		fmt.Printf("What do you want to do?\n")
		fmt.Println("    (1) Add / edit user")
		fmt.Println("    (2) Remove user")
		fmt.Println("    (3) List all users")
		fmt.Println("    (4) Run setup wizard")
		fmt.Println("    (5) Force deploy")
		fmt.Println("    (q) Quit")
		for {
			var line string
			fmt.Printf("Please enter your choice: ")
			fmt.Scanln(&line)
			line = strings.ToLower(line)
			if line == "1" {
				err = editUser()
				break
			} else if line == "2" {
				err = removeUser()
				break
			} else if line == "3" {
				err = core.ListUsers()
				break
			} else if line == "4" {
				err = setup()
				break
			} else if line == "5" {
				err = deploy()
				break
			} else if line == "q" {
				goto bail
			}
		}
		if err != nil {
			return
		}
	}
bail:
	return
}

func editUser() (err error) {
	var oldUser, newUser core.User

	if err = core.EnterUsername(&newUser.Name); err != nil {
		return
	}

	if err = core.LoadOldNewUsers(newUser.Name, &oldUser, &newUser); err != nil {
		return
	}

	if err = core.EnterUserPassword(&oldUser, &newUser); err != nil {
		return
	}

	if err = core.ConfigureUserAccess(&newUser); err != nil {
		return
	}

	if err = core.SaveUser(&newUser); err != nil {
		return
	}

	if err = core.DeployGist("users"); err != nil {
		return
	}

	return
}

func removeUser() (err error) {
	if err = core.RemoveUser(); err != nil {
		return
	}

	if err = core.DeployGist("users"); err != nil {
		return
	}

	return
}

func setup() (err error) {
    if err = core.SetupProxy(); err != nil {
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

	if err = core.SetupCloudflareSubdomain(); err != nil {
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

	if err = core.GetGistUser(); err != nil {
		return
	}

	if err = core.ConfigureGist("Accounts", &core.Config.GistID.Accounts, core.Config.GistUser, core.Config.GistToken); err != nil {
		return
	}

	if err = core.ConfigureGist("Users", &core.Config.GistID.Users, core.Config.GistUser, core.Config.GistToken); err != nil {
		return
	}

	if err = core.ConfigureGist("Static", &core.Config.GistID.Static, core.Config.GistUser, core.Config.GistToken); err != nil {
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

	return deploy()
}

func deploy() (err error) {
	if err = core.InitCloudflareAPI(); err != nil {
		return
	}

    if err = core.SelectCloudflareAccount(); err != nil {
        return
    }

    if err = core.SetupCloudflareSubdomain(); err != nil {
        return
    }

	if err = core.InitGitHubAPI(); err != nil {
		return
	}

	if err = core.CopyStaticFiles(); err != nil {
		return
	}

	if err = core.DeployGist("accounts"); err != nil {
		return
	}

	if err = core.DeployGist("users"); err != nil {
		return
	}

	if err = core.DeployGist("static"); err != nil {
		return
	}

	if err = core.DeployWorker(); err != nil {
		return
	}

	fmt.Printf("Press ENTER to continue...")
	fmt.Scanln()
	fmt.Println()

	return
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
