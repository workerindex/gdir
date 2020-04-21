package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"

	"github.com/cloudflare/cloudflare-go"
	"github.com/google/go-github/v31/github"
	"golang.org/x/crypto/ssh/terminal"
	"golang.org/x/oauth2"
)

func run() (err error) {
	if err = parseArgs(); err != nil {
		return
	}

	fmt.Println("                                                                   ")
	fmt.Println("                                  _ _                              ")
	fmt.Println("                          __ _ __| (_)_ _                          ")
	fmt.Println("                         / _` / _` | | '_|                         ")
	fmt.Println(`                         \__, \__,_|_|_|                           `)
	fmt.Println("                         |___/                                     ")
	fmt.Println("                                                                   ")

	if err = loadConfigFile(); err != nil {
		return
	}

	if err = enterCloudflareEmail(); err != nil {
		return
	}

	if err = enterCloudflareKey(); err != nil {
		return
	}

	if err = initCloudflareAPI(); err != nil {
		return
	}

	if err = selectCloudflareAccount(); err != nil {
		return
	}

	if err = selectWorker(); err != nil {
		return
	}

	if err = enterGistToken(); err != nil {
		return
	}

	if err = initGitHubAPI(); err != nil {
		return
	}

	if err = enterAccoutsGist("Accounts", &args.GistID.Accounts); err != nil {
		return
	}

	if err = enterAccoutsGist("Users", &args.GistID.Users); err != nil {
		return
	}

	if err = enterAccoutsGist("Static", &args.GistID.Static); err != nil {
		return
	}

	if err = getGistUser(); err != nil {
		return
	}

	if err = configureSecretKey(); err != nil {
		return
	}

	if err = configureAccountRotation(); err != nil {
		return
	}

	if err = configureAccountCandidates(); err != nil {
		return
	}

	if err = enterAccountsJSONDir(); err != nil {
		return
	}

	if err = processAccountsJSONDir(); err != nil {
		return
	}

	if err = configureAdminUser(); err != nil {
		return
	}

	if err = npmInstall(); err != nil {
		return
	}

	if err = npmBuild(); err != nil {
		return
	}

	if err = deployGist("accounts", args.GistID.Accounts); err != nil {
		return
	}

	if err = deployGist("users", args.GistID.Users); err != nil {
		return
	}

	if err = deployGist("static", args.GistID.Static); err != nil {
		return
	}

	if err = deployWorker(); err != nil {
		return
	}

	return
}

func parseArgs() (err error) {
	flag.Parse()
	return
}

func loadConfigFile() (err error) {
	if args.ConfigFile == "" {
		return
	}

	stat, err := os.Stat(args.ConfigFile)
	if os.IsNotExist(err) {
		err = nil
		return
	}
	if err != nil {
		return
	}

	if stat.IsDir() {
		err = fmt.Errorf("config file cannot be a directory: %s", args.ConfigFile)
		return
	}

	fmt.Printf("Loading existing config from %s\n", args.ConfigFile)

	b, err := ioutil.ReadFile(args.ConfigFile)
	if err != nil {
		return
	}

	clone, err := json.Marshal(&args)
	if err != nil {
		return
	}

	if err = json.Unmarshal(b, &args); err != nil {
		return
	}

	// command line options overwrite config file options
	if err = json.Unmarshal(clone, &args); err != nil {
		return
	}

	return
}

func enterCloudflareEmail() (err error) {
	if args.CloudflareEmail != "" {
		fmt.Println("Your Cloudflare login Email:", args.CloudflareEmail)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.CloudflareEmail = ""
		}
	}
	if args.CloudflareEmail == "" {
		fmt.Printf("Your Cloudflare login Email: ")
		fmt.Scanln(&args.CloudflareEmail)
		fmt.Println("")
		err = saveConfigFile()
	}
	return
}

func enterCloudflareKey() (err error) {
	if args.CloudflareKey != "" {
		fmt.Println("Your Cloudflare API Key:", args.CloudflareKey)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.CloudflareKey = ""
		}
	}
	if args.CloudflareKey == "" {
		fmt.Println("Please visit https://dash.cloudflare.com/profile/api-tokens and get")
		fmt.Printf("your Global API Key: ")
		fmt.Scanln(&args.CloudflareKey)
		fmt.Println("")
		err = saveConfigFile()
	}
	return
}

func initCloudflareAPI() (err error) {
	cf, err = cloudflare.New(args.CloudflareKey, args.CloudflareEmail)
	return
}

func selectCloudflareAccount() (err error) {
	if args.CloudflareAccount != "" {
		fmt.Println("Your selected Cloudflare account:", args.CloudflareAccount)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.CloudflareAccount = ""
		}
	}
	if args.CloudflareAccount == "" {
		var line string
		var selection uint64
		var accounts []cloudflare.Account
		if accounts, _, err = cf.Accounts(cloudflare.PaginationOptions{}); err != nil {
			return
		}
		if len(accounts) == 0 {
			err = fmt.Errorf("no accounts under your cloudflare")
			return
		} else {
			fmt.Println("Your available Cloudflare accounts:")
			for i, account := range accounts {
				fmt.Printf("    (%d) %s [%s]\n", i+1, account.Name, account.ID)
			}
			for {
				fmt.Printf("Choose an account: ")
				fmt.Scanln(&line)
				if selection, err = strconv.ParseUint(line, 10, 64); err != nil {
					continue
				}
				args.CloudflareAccount = accounts[selection-1].ID
				break
			}
			if err = saveConfigFile(); err != nil {
				return
			}
		}
	}
	cf.AccountID = args.CloudflareAccount
	return
}

func selectWorker() (err error) {
	if args.CloudflareWorker != "" {
		fmt.Println("Your selected Cloudflare Worker ID:", args.CloudflareWorker)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.CloudflareWorker = ""
		}
	}
	if args.CloudflareWorker == "" {
		var line string
		var selection uint64
		var resp cloudflare.WorkerListResponse
		if resp, err = cf.ListWorkerScripts(); err != nil {
			return
		}
		if len(resp.WorkerList) == 0 {
			err = enterNewWorkerName()
		} else {
			fmt.Println("Your available Cloudflare Workers:")
			for i, worker := range resp.WorkerList {
				fmt.Printf("    (%d) %s\n", i+1, worker.ID)
			}
			for {
				fmt.Printf("Choose one or enter 0 to create a new Worker: ")
				fmt.Scanln(&line)
				if selection, err = strconv.ParseUint(line, 10, 64); err != nil {
					continue
				}
				if selection == 0 {
					err = enterNewWorkerName()
					break
				} else {
					args.CloudflareWorker = resp.WorkerList[selection-1].ID
					break
				}
			}
			if err = saveConfigFile(); err != nil {
				return
			}
		}
	}
	return
}

func enterNewWorkerName() (err error) {
	var line string

	fmt.Println("Naming rule:")

	fmt.Println("    start with a letter")
	var rule1 = regexp.MustCompile(`^[[:alpha:]]`)

	fmt.Println("    end with a letter or digit")
	var rule2 = regexp.MustCompile(`\w$`)

	fmt.Println("    include only letters, digits, underscore, and hyphen")
	var rule3 = regexp.MustCompile(`^[\w_-]+$`)

	fmt.Println("    be 63 characters or less")

	for {
		fmt.Printf("Please enter a name for your new Worker: ")
		fmt.Scanln(&line)
		line = strings.TrimSpace(line)
		if len(line) <= 63 && rule1.MatchString(line) && rule2.MatchString(line) && rule3.MatchString(line) {
			break
		}
	}
	args.CloudflareWorker = line
	return saveConfigFile()
}

func enterGistToken() (err error) {
	if args.GistToken != "" {
		fmt.Println("Your GitHub Gist Token:", args.GistToken)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.GistToken = ""
		}
	}
	if args.GistToken == "" {
		fmt.Println("Please visit https://github.com/settings/tokens and generate a new")
		fmt.Printf("token with \"gist\" scope: ")
		fmt.Scanln(&args.GistToken)
		fmt.Println("")
		err = saveConfigFile()
	}
	return
}

func initGitHubAPI() (err error) {
	gh = github.NewClient(
		oauth2.NewClient(
			context.Background(),
			oauth2.StaticTokenSource(
				&oauth2.Token{AccessToken: args.GistToken},
			)))
	return
}

func enterAccoutsGist(name string, conf *string) (err error) {
	if *conf != "" {
		fmt.Printf("Your %s Gist: %s\n", name, *conf)
		if !promptYesNoWithDefault("Is it correct?", true) {
			*conf = ""
		}
	}
	if *conf == "" {
		fmt.Printf("Specify how you want to configure your %s Gist:\n", name)
		fmt.Println("    (1) Create a new Gist                   (default)")
		fmt.Println("    (2) Enter an existing Gist URL / ID")
		for {
			var line string
			fmt.Printf("Please enter your choice: ")
			fmt.Scanln(&line)
			if regexp.MustCompile(`^\s*$`).MatchString(line) || regexp.MustCompile(`^\s*1\s*$`).MatchString(line) {
				err = createNewGist(name, conf)
				break
			} else if regexp.MustCompile(`^\s*2\s*$`).MatchString(line) {
				err = enterGistID(name, conf)
				break
			}
		}
	}
	return
}

func createNewGist(name string, conf *string) (err error) {
	name = fmt.Sprintf(".gdir-%s", strings.ToLower(name))
	gist, _, err := gh.Gists.Create(context.Background(), &github.Gist{
		Description: &name,
		Files: map[github.GistFilename]github.GistFile{
			github.GistFilename(name): {
				Content: &name,
			},
		},
	})
	if err != nil {
		return
	}
	*conf = *gist.ID
	return saveConfigFile()
}

func enterGistID(name string, conf *string) (err error) {
	var line string
	for {
		fmt.Printf("Please enter a Gist URL / ID for %s: ", name)
		fmt.Scanln(&line)
		line = strings.TrimSpace(line)
		if regexp.MustCompile(`^https?://`).MatchString(line) {
			var u *url.URL
			if u, err = url.Parse(line); err != nil {
				err = nil
				continue
			}
			parts := strings.Split(u.Path, "/")
			if len(parts) < 2 {
				continue
			}
			*conf = parts[1]
			break
		} else if regexp.MustCompile(`^[0-9a-fA-F]{32}$`).MatchString(line) {
			*conf = line
			break
		}
	}
	return saveConfigFile()
}

func getGistUser() (err error) {
	gist, _, err := gh.Gists.Get(context.Background(), args.GistID.Accounts)
	if err != nil {
		return
	}
	args.GistUser = *gist.Owner.Login
	return saveConfigFile()
}

func configureSecretKey() (err error) {
	if args.SecretKey != "" {
		fmt.Println("Your gdir secret key:", args.SecretKey)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.SecretKey = ""
		}
	}
	if args.SecretKey == "" {
		fmt.Println("Specify how you want to configure your gdir secret key:")
		fmt.Println("    (1) Generate secure random value           (default)")
		fmt.Println("    (2) Enter your own secret key      (not recommended)")
		for {
			var line string
			fmt.Printf("Please enter your choice: ")
			fmt.Scanln(&line)
			if regexp.MustCompile(`^\s*$`).MatchString(line) || regexp.MustCompile(`^\s*1\s*$`).MatchString(line) {
				err = generateSecretKey()
				break
			} else if regexp.MustCompile(`^\s*2\s*$`).MatchString(line) {
				err = enterSecretKey()
				break
			}
		}
	}
	return
}

func generateSecretKey() (err error) {
	b := make([]byte, 64)
	if _, err = rand.Read(b); err != nil {
		return
	}
	args.SecretKey = hex.EncodeToString(b)
	return saveConfigFile()
}

func enterSecretKey() (err error) {
	var line string
	fmt.Printf("Please enter your secure gdir master secret key: ")
	fmt.Scanln(&line)
	args.SecretKey = strings.TrimSpace(line)
	return saveConfigFile()
}

func configureAccountRotation() (err error) {
	var line string
	if args.AccountRotationStr != "" {
		args.AccountRotation = 0
		line = args.AccountRotationStr
	} else if args.AccountRotation > 0 {
		fmt.Println("Account candidates rotations interval:", args.AccountRotation)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.AccountRotation = 0
		}
	}
	if args.AccountRotation == 0 {
		for {
			if line == "" {
				fmt.Printf("Please enter account candidates rotations interval (default 60): ")
				fmt.Scanln(&line)
			}
			line = strings.TrimSpace(line)
			if line == "" {
				args.AccountRotation = 60
				break
			}
			if args.AccountRotation, err = strconv.ParseUint(line, 10, 64); err == nil {
				break
			}
			line = ""
		}
		err = saveConfigFile()
	}
	return
}

func configureAccountCandidates() (err error) {
	var line string
	if args.AccountCandidatesStr != "" {
		args.AccountCandidates = 0
		line = args.AccountCandidatesStr
	} else if args.AccountCandidates > 0 {
		fmt.Println("Account candidates size:", args.AccountCandidates)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.AccountCandidates = 0
		}
	}
	if args.AccountCandidates == 0 {
		for {
			if line == "" {
				fmt.Printf("Please enter account candidates size (default 10): ")
				fmt.Scanln(&line)
			}
			line = strings.TrimSpace(line)
			if line == "" {
				args.AccountCandidates = 10
				break
			}
			if args.AccountCandidates, err = strconv.ParseUint(line, 10, 64); err == nil {
				break
			}
			line = ""
		}
		err = saveConfigFile()
	}
	return
}

func enterAccountsJSONDir() (err error) {
	if args.AccountsJSONDir != "" {
		fmt.Println("Your Accounts JSON directory:", args.AccountsJSONDir)
		if !promptYesNoWithDefault("Is it correct?", true) {
			args.AccountsJSONDir = ""
		}
	}
	if args.AccountsJSONDir == "" {
		fmt.Println("Please follow https://github.com/xyou365/AutoRclone to generate")
		fmt.Printf("Accounts JSON directory: ")
		fmt.Scanln(&args.AccountsJSONDir)
		fmt.Println("")
		err = saveConfigFile()
	}
	return
}

func processAccountsJSONDir() (err error) {
	if args.AccountsCount > 0 {
		if promptYesNoWithDefault(fmt.Sprintf("You have added %d accounts, do you want to re-scan for new accounts?", args.AccountsCount), false) {
			args.AccountsCount = 0
		}
	}
	if args.AccountsCount == 0 {
		var files []os.FileInfo
		var inPath string
		var inBytes []byte
		var outBytes []byte
		if files, err = ioutil.ReadDir(args.AccountsJSONDir); err != nil {
			return
		}

		if _, err = os.Stat("accounts"); os.IsNotExist(err) {
			if err = os.MkdirAll("accounts", 0700); err != nil {
				return
			}
		}

		for i, file := range files {
			if !file.IsDir() && strings.HasSuffix(file.Name(), ".json") && file.Size() > 0 {
				inPath = filepath.Join(args.AccountsJSONDir, file.Name())
				fmt.Printf("Encrypting account %d: %s\n", i, file.Name())

				if inBytes, err = ioutil.ReadFile(inPath); err != nil {
					return
				}

				if outBytes, err = gcmEncrypt(args.SecretKey, "account", inBytes); err != nil {
					return
				}

				if err = ioutil.WriteFile(filepath.Join("accounts", fmt.Sprintf("%d", i)), outBytes, 0600); err != nil {
					return
				}
				args.AccountsCount++
			}
		}
		err = saveConfigFile()
	}
	return
}

func configureAdminUser() (err error) {
	var user user
	var files []os.FileInfo
	if _, err = os.Stat("users"); !os.IsNotExist(err) {
		if files, err = ioutil.ReadDir("users"); err != nil {
			return
		}
		for _, file := range files {
			if !file.IsDir() {
				return
			}
		}
	} else {
		if err = os.MkdirAll("users", 0700); err != nil {
			return
		}
	}
	fmt.Println("Add an admin user...")
	fmt.Printf("Please enter your admin user name: ")
	fmt.Scanln(&user.Name)
	fmt.Printf("Please enter your admin user password: ")
	bytePassword, err := terminal.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return
	}
	fmt.Println()
	user.Pass = string(bytePassword)
	outBytes, err := json.Marshal(&user)
	if err != nil {
		return
	}
	hash := sha256.New()
	hash.Write([]byte(args.SecretKey))
	hash.Write([]byte(user.Name))
	encrypted, err := gcmEncrypt(args.SecretKey, "user", outBytes)
	if err != nil {
		return
	}
	return ioutil.WriteFile(filepath.Join("users", hex.EncodeToString(hash.Sum(nil))), encrypted, 0600)
}

func npmInstall() (err error) {
	if _, err = os.Stat("node_modules"); !os.IsNotExist(err) {
		if promptYesNoWithDefault("Directory node_modules already exists. Do you want to re-run npm install?", false) {
			if err = os.RemoveAll("node_modules"); err != nil {
				return
			}
		}
	}
	if _, err = os.Stat("node_modules"); os.IsNotExist(err) {
		cmd := exec.Command("npm", "install")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err = cmd.Run()
	}
	return
}

func npmBuild() (err error) {
	cmd := exec.Command("npm", "run", "build")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func deployGist(dir string, gistID string) (err error) {
	if _, err = os.Stat(filepath.Join(dir, ".git")); os.IsNotExist(err) {
		fmt.Printf("Initializing Git repo in %s...\n", dir)
		if err = initGitRepo(
			dir,
			fmt.Sprintf("https://gist.github.com/%s.git", gistID),
			fmt.Sprintf("git@gist.github.com:%s.git", gistID),
		); err != nil {
			return
		}
	}
	fmt.Printf("Deploying %s to Gist...\n", dir)
	cmd := exec.Command("git", "add", ".")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		return
	}
	cmd = exec.Command("git", "commit", "--no-edit", "--allow-empty-message")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()
	cmd = exec.Command("git", "push", "-f", "-u", "origin", "master")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()
	return
}

func initGitRepo(dir string, httpsRemote string, sshRemote string) (err error) {
	var remote string
	fmt.Printf("Specify which protocol you want to configure your %s Git repo:\n", dir)
	fmt.Println("    (1) HTTPS                                  (default)")
	fmt.Println("    (2) SSH            (needs SSH key setup with GitHub)")
	for {
		var line string
		fmt.Printf("Please enter your choice: ")
		fmt.Scanln(&line)
		if regexp.MustCompile(`^\s*$`).MatchString(line) || regexp.MustCompile(`^\s*1\s*$`).MatchString(line) {
			remote = httpsRemote
			break
		} else if regexp.MustCompile(`^\s*2\s*$`).MatchString(line) {
			remote = sshRemote
			break
		}
	}
	cmd := exec.Command("git", "init")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		return
	}
	cmd = exec.Command("git", "remote", "add", "origin", remote)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		return
	}
	cmd = exec.Command("git", "config", "user.name", "gdir")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		return
	}
	cmd = exec.Command("git", "config", "user.email", "gdir@google.com")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		return
	}
	return
}

func deployWorker() (err error) {
	script, err := ioutil.ReadFile("dist/worker.js")
	if err != nil {
		return
	}
	fmt.Printf("Deploying Cloudflare Worker %s...\n", args.CloudflareWorker)
	_, err = cf.UploadWorker(&cloudflare.WorkerRequestParams{
		ScriptName: args.CloudflareWorker,
	}, string(script))
	fmt.Printf("Now you can go to https://dash.cloudflare.com/%s/workers/view/%s to checkout your Worker!\n", args.CloudflareAccount, args.CloudflareWorker)
	fmt.Println("Check here to create custom routes with your own domain names:\nhttps://developers.cloudflare.com/workers/about/routes/")
	return
}

func saveConfigFile() (err error) {
	b, err := json.Marshal(&args)
	if err != nil {
		return
	}
	return ioutil.WriteFile(args.ConfigFile, b, 0600)
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
