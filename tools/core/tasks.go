package core

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
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

func LoadConfigFile() (err error) {
	if Config.ConfigFile == "" {
		return
	}

	stat, err := os.Stat(Config.ConfigFile)
	if os.IsNotExist(err) {
		err = nil
		return
	}
	if err != nil {
		return
	}

	if stat.IsDir() {
		err = fmt.Errorf("config file cannot be a directory: %s", Config.ConfigFile)
		return
	}

	fmt.Printf("Loading existing config from %s\n", Config.ConfigFile)

	b, err := ioutil.ReadFile(Config.ConfigFile)
	if err != nil {
		return
	}

	clone, err := json.Marshal(&Config)
	if err != nil {
		return
	}

	if err = json.Unmarshal(b, &Config); err != nil {
		return
	}

	// command line options overwrite config file options
	if err = json.Unmarshal(clone, &Config); err != nil {
		return
	}

	return
}

func EnterCloudflareEmail() (err error) {
	if Config.CloudflareEmail != "" {
		fmt.Println("Your Cloudflare login Email:", Config.CloudflareEmail)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.CloudflareEmail = ""
		}
	}
	if Config.CloudflareEmail == "" {
		for loop := true; loop; loop = Config.CloudflareEmail == "" {
			fmt.Printf("Your Cloudflare login Email: ")
			fmt.Scanln(&Config.CloudflareEmail)
		}
		fmt.Println("")
		err = SaveConfigFile()
	}
	return
}

func EnterCloudflareKey() (err error) {
	if Config.CloudflareKey != "" {
		fmt.Println("Your Cloudflare API Key:", Config.CloudflareKey)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.CloudflareKey = ""
		}
	}
	if Config.CloudflareKey == "" {
		for loop := true; loop; loop = Config.CloudflareKey == "" {
			fmt.Println("Please visit https://dash.cloudflare.com/profile/api-tokens and get")
			fmt.Printf("your Global API Key: ")
			fmt.Scanln(&Config.CloudflareKey)
		}
		fmt.Println("")
		err = SaveConfigFile()
	}
	return
}

func InitCloudflareAPI() (err error) {
	Cf, err = cloudflare.New(Config.CloudflareKey, Config.CloudflareEmail)
	return
}

func SelectCloudflareAccount() (err error) {
	if Config.CloudflareAccount != "" {
		fmt.Println("Your selected Cloudflare account:", Config.CloudflareAccount)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.CloudflareAccount = ""
		}
	}
	if Config.CloudflareAccount == "" {
		var line string
		var selection uint64
		var accounts []cloudflare.Account
		if accounts, _, err = Cf.Accounts(cloudflare.PaginationOptions{}); err != nil {
			return
		}
		if len(accounts) == 0 {
			err = fmt.Errorf("no accounts under your cloudflare")
			return
		}
		if len(accounts) == 1 {
			Config.CloudflareAccount = accounts[0].ID
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
				Config.CloudflareAccount = accounts[selection-1].ID
				break
			}
		}
		if err = SaveConfigFile(); err != nil {
			return
		}
	}
	Cf.AccountID = Config.CloudflareAccount
	return
}

func SelectWorker() (err error) {
	if Config.CloudflareWorker != "" {
		fmt.Println("Your selected Cloudflare Worker ID:", Config.CloudflareWorker)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.CloudflareWorker = ""
		}
	}
	if Config.CloudflareWorker == "" {
		var line string
		var selection uint64
		var resp cloudflare.WorkerListResponse
		if resp, err = Cf.ListWorkerScripts(); err != nil {
			return
		}
		if len(resp.WorkerList) == 0 {
			err = EnterNewWorkerName()
		} else {
			fmt.Println("Your available Cloudflare Workers:")
			for i, worker := range resp.WorkerList {
				fmt.Printf("    (%d) %s\n", i+1, worker.ID)
			}
			fmt.Println("    (0) Create a new Worker     (Default)")
			for {
				fmt.Printf("Choose one of above: ")
				fmt.Scanln(&line)
				if regexp.MustCompile(`^\s*$`).MatchString(line) {
					err = EnterNewWorkerName()
					break
				}
				if selection, err = strconv.ParseUint(line, 10, 64); err != nil {
					continue
				}
				if selection == 0 {
					err = EnterNewWorkerName()
					break
				} else {
					Config.CloudflareWorker = resp.WorkerList[selection-1].ID
					break
				}
			}
			if err = SaveConfigFile(); err != nil {
				return
			}
		}
	}
	return
}

func EnterNewWorkerName() (err error) {
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
	Config.CloudflareWorker = line
	return SaveConfigFile()
}

func EnterGistToken() (err error) {
	if Config.GistToken != "" {
		fmt.Println("Your GitHub Gist Token:", Config.GistToken)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.GistToken = ""
		}
	}
	if Config.GistToken == "" {
		for loop := true; loop; loop = Config.GistToken == "" {
			fmt.Println("Please visit https://github.com/settings/tokens and generate a new")
			fmt.Printf("token with \"gist\" scope: ")
			fmt.Scanln(&Config.GistToken)
		}
		fmt.Println("")
		err = SaveConfigFile()
	}
	return
}

func InitGitHubAPI() (err error) {
	Gh = github.NewClient(
		oauth2.NewClient(
			context.Background(),
			oauth2.StaticTokenSource(
				&oauth2.Token{AccessToken: Config.GistToken},
			)))
	return
}

func EnterAccoutsGist(name string, conf *string) (err error) {
	if *conf != "" {
		fmt.Printf("Your %s Gist: %s\n", name, *conf)
		if !PromptYesNoWithDefault("Is it correct?", true) {
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
				err = CreateNewGist(name, conf)
				break
			} else if regexp.MustCompile(`^\s*2\s*$`).MatchString(line) {
				err = EnterGistID(name, conf)
				break
			}
		}
	}
	return
}

func CreateNewGist(name string, conf *string) (err error) {
	name = fmt.Sprintf(".gdir-%s", strings.ToLower(name))
	gist, _, err := Gh.Gists.Create(context.Background(), &github.Gist{
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
	return SaveConfigFile()
}

func EnterGistID(name string, conf *string) (err error) {
	var line string
	for {
		fmt.Printf("Please enter a Gist URL / ID for %s: ", name)
		fmt.Scanln(&line)
		line = strings.TrimSpace(line)
		if m := regexp.MustCompile(`^\s*([0-9a-fA-F]{32})\s*$`).FindStringSubmatch(line); m != nil {
			*conf = m[1]
		} else if m := regexp.MustCompile(`^\s*git\@gist\.github\.com\:([0-9a-fA-F]{32})(\.git)?\s*$`).FindStringSubmatch(line); m != nil {
			*conf = m[1]
		} else if m := regexp.MustCompile(`\s*https?\:\/\/gist\.github\.com\/([0-9a-fA-F]{32})(\.git)?\s*$`).FindStringSubmatch(line); m != nil {
			*conf = m[1]
		} else if m := regexp.MustCompile(`^\s*https?\:\/\/gist\.github\.com\/[^\/]+\/([0-9a-fA-F]{32})\s*$`).FindStringSubmatch(line); m != nil {
			*conf = m[1]
		} else {
			continue
		}
		break
	}
	return SaveConfigFile()
}

func GetGistUser() (err error) {
	gist, _, err := Gh.Gists.Get(context.Background(), Config.GistID.Accounts)
	if err != nil {
		return
	}
	Config.GistUser = *gist.Owner.Login
	return SaveConfigFile()
}

func ConfigureSecretKey() (err error) {
	if Config.SecretKey != "" {
		fmt.Println("Your gdir secret key:", Config.SecretKey)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.SecretKey = ""
		}
	}
	if Config.SecretKey == "" {
		fmt.Println("Specify how you want to configure your gdir secret key:")
		fmt.Println("    (1) Generate secure random value           (default)")
		fmt.Println("    (2) Enter your own secret key      (not recommended)")
		for {
			var line string
			fmt.Printf("Please enter your choice: ")
			fmt.Scanln(&line)
			if regexp.MustCompile(`^\s*$`).MatchString(line) || regexp.MustCompile(`^\s*1\s*$`).MatchString(line) {
				err = GenerateSecretKey()
				break
			} else if regexp.MustCompile(`^\s*2\s*$`).MatchString(line) {
				err = EnterSecretKey()
				break
			}
		}
	}
	return
}

func GenerateSecretKey() (err error) {
	b := make([]byte, 64)
	if _, err = rand.Read(b); err != nil {
		return
	}
	Config.SecretKey = hex.EncodeToString(b)
	return SaveConfigFile()
}

func EnterSecretKey() (err error) {
	var line string
	fmt.Printf("Please enter your secure gdir master secret key: ")
	fmt.Scanln(&line)
	Config.SecretKey = strings.TrimSpace(line)
	return SaveConfigFile()
}

func ConfigureAccountRotation() (err error) {
	var line string
	if Config.AccountRotationStr != "" {
		Config.AccountRotation = 0
		line = Config.AccountRotationStr
	} else if Config.AccountRotation > 0 {
		fmt.Println("Account candidates rotations interval:", Config.AccountRotation)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.AccountRotation = 0
		}
	}
	if Config.AccountRotation == 0 {
		for {
			if line == "" {
				fmt.Printf("Please enter account candidates rotations interval (default 60): ")
				fmt.Scanln(&line)
			}
			line = strings.TrimSpace(line)
			if line == "" {
				Config.AccountRotation = 60
				break
			}
			if Config.AccountRotation, err = strconv.ParseUint(line, 10, 64); err == nil {
				break
			}
			line = ""
		}
		err = SaveConfigFile()
	}
	return
}

func ConfigureAccountCandidates() (err error) {
	var line string
	if Config.AccountCandidatesStr != "" {
		Config.AccountCandidates = 0
		line = Config.AccountCandidatesStr
	} else if Config.AccountCandidates > 0 {
		fmt.Println("Account candidates size:", Config.AccountCandidates)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.AccountCandidates = 0
		}
	}
	if Config.AccountCandidates == 0 {
		for {
			if line == "" {
				fmt.Printf("Please enter account candidates size (default 10): ")
				fmt.Scanln(&line)
			}
			line = strings.TrimSpace(line)
			if line == "" {
				Config.AccountCandidates = 10
				break
			}
			if Config.AccountCandidates, err = strconv.ParseUint(line, 10, 64); err == nil {
				break
			}
			line = ""
		}
		err = SaveConfigFile()
	}
	return
}

func EnterAccountsJSONDir() (err error) {
	if Config.AccountsJSONDir != "" {
		fmt.Println("Your Accounts JSON directory:", Config.AccountsJSONDir)
		if !PromptYesNoWithDefault("Is it correct?", true) {
			Config.AccountsJSONDir = ""
		}
	}
	if Config.AccountsJSONDir == "" {
		for loop := true; loop; loop = Config.AccountsJSONDir == "" {
			fmt.Println("Please follow https://github.com/xyou365/AutoRclone to generate")
			fmt.Printf("Accounts JSON directory: ")
			fmt.Scanln(&Config.AccountsJSONDir)
		}
		fmt.Println("")
		err = SaveConfigFile()
	}
	return
}

func ProcessAccountsJSONDir() (err error) {
	if Config.AccountsCount > 0 {
		if PromptYesNoWithDefault(fmt.Sprintf("You have added %d accounts, do you want to re-scan for new accounts?", Config.AccountsCount), false) {
			Config.AccountsCount = 0
		}
	}
	if Config.AccountsCount == 0 {
		var files []os.FileInfo
		var inPath string
		var inBytes []byte
		var outBytes []byte
		if files, err = ioutil.ReadDir(Config.AccountsJSONDir); err != nil {
			return
		}

		if _, err = os.Stat("accounts"); os.IsNotExist(err) {
			if err = os.MkdirAll("accounts", 0700); err != nil {
				return
			}
		}

		for i, file := range files {
			if !file.IsDir() && strings.HasSuffix(file.Name(), ".json") && file.Size() > 0 {
				inPath = filepath.Join(Config.AccountsJSONDir, file.Name())
				fmt.Printf("Encrypting account %d: %s\n", i, file.Name())

				if inBytes, err = ioutil.ReadFile(inPath); err != nil {
					return
				}

				if outBytes, err = GCMEncrypt(Config.SecretKey, "account", inBytes); err != nil {
					return
				}

				if err = ioutil.WriteFile(filepath.Join("accounts", fmt.Sprintf("%d", i)), outBytes, 0600); err != nil {
					return
				}
				Config.AccountsCount++
			}
		}
		err = SaveConfigFile()
	}
	return
}

func ConfigureAdminUser() (err error) {
	var user User
	var files []os.FileInfo
	var bytePassword []byte
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
	for loop := true; loop; loop = user.Name == "" {
		fmt.Printf("Please enter your admin user name: ")
		fmt.Scanln(&user.Name)
	}
	for loop := true; loop; loop = user.Pass == "" {
		fmt.Printf("Please enter your admin user password: ")
		if bytePassword, err = terminal.ReadPassword(int(syscall.Stdin)); err != nil {
			return
		}
		fmt.Println()
		user.Pass = string(bytePassword)
	}
	return SaveUser(&user)
}

func ComputeUserPath(name string) (userPath string, err error) {
	hash := sha256.New()
	hash.Write([]byte(Config.SecretKey))
	hash.Write([]byte(name))
	userPath = filepath.Join("users", hex.EncodeToString(hash.Sum(nil)))
	return
}

func ConfigureUserAccess(user *User) (err error) {
	for {
		confirmed := false
		if len(user.DrivesWhiteList) > 0 {
			if confirmed, err = ConfigureUserAccessList("white-list", &user.DrivesWhiteList, "black-list", &user.DrivesBlackList); err != nil {
				return
			}
		} else if len(user.DrivesBlackList) > 0 {
			if confirmed, err = ConfigureUserAccessList("black-list", &user.DrivesBlackList, "white-list", &user.DrivesWhiteList); err != nil {
				return
			}
		} else {
			var line string
			var drives []string
			fmt.Println("The user currently has global access to all drives.")
			fmt.Println("Please specify what do you want to do with it:")
			fmt.Println("    (1) Confirm                         (default)")
			fmt.Println("    (2) Convert to white-list access control list")
			fmt.Println("    (3) Convert to black-list access control list")
			fmt.Printf("Please enter your choice: ")
			fmt.Scanln(&line)
			if line == "1" || line == "" {
				confirmed = true
			} else if line == "2" {
				fmt.Println("(Use comma to separate between drive IDs.)")
				fmt.Printf("Enter white-list access control list of drives: ")
				fmt.Scanln(&line)
				drives = strings.Split(line, ",")
				for i, drive := range drives {
					drives[i] = strings.TrimSpace(drive)
				}
				user.DrivesWhiteList = drives
			} else if line == "3" {
				fmt.Println("(Use comma to separate between drive IDs.)")
				fmt.Printf("Enter black-list access control list of drives: ")
				fmt.Scanln(&line)
				drives = strings.Split(line, ",")
				for i, drive := range drives {
					drives[i] = strings.TrimSpace(drive)
				}
				user.DrivesBlackList = drives
			}
		}
		if confirmed {
			break
		}
	}
	return
}

func ConfigureUserAccessList(targetListName string, targetList *[]string, counterListName string, counterList *[]string) (confirmed bool, err error) {
	var line string
	var drives []string
	*counterList = nil
	fmt.Printf("The user currently has following drives in its %s access list:\n", targetListName)
	for i, drive := range *targetList {
		fmt.Printf("    (%d) %s\n", i+1, drive)
	}
	fmt.Println("Please specify what do you want to do with it:")
	fmt.Println("    (1) Confirm                         (default)")
	fmt.Println("    (2) Append drives to the list")
	fmt.Println("    (3) Remove drives from the list")
	fmt.Println("    (4) Replace with a new list of drives")
	fmt.Printf("    (5) Convert to %s access control\n", counterListName)
	fmt.Println("    (6) Disable access control on the user")
	fmt.Printf("Please enter your choice: ")
	fmt.Scanln(&line)
	if line == "1" || line == "" {
		confirmed = true
	} else if line == "2" {
		fmt.Println("(Use comma to separate between drive IDs.)")
		fmt.Printf("Append drives to %s access list: ", targetListName)
		fmt.Scanln(&line)
		drives = strings.Split(line, ",")
		for _, drive := range drives {
			found := false
			drive = strings.TrimSpace(drive)
			for _, d := range *targetList {
				if d == drive {
					found = true
					break
				}
			}
			if !found {
				*targetList = append(*targetList, drive)
			}
		}
	} else if line == "3" {
		idxs := []uint64{}
		drives = []string{}
		for {
			fmt.Println("(Enter numbers from the list above)")
			fmt.Println("(Use comma to separate between selections)")
			fmt.Printf("Remove drives from %s access list: ", targetListName)
			fmt.Scanln(&line)
			valid := true
			for _, idx := range strings.Split(line, ",") {
				var i uint64
				if i, err = strconv.ParseUint(idx, 10, 64); err != nil {
					err = nil
					valid = false
				}
				idxs = append(idxs, i)
			}
			if valid {
				break
			}
		}
		for i, drive := range *targetList {
			found := false
			for _, idx := range idxs {
				if uint64(i+1) == idx {
					found = true
					break
				}
			}
			if !found {
				drives = append(drives, drive)
			}
		}
		*targetList = drives
	} else if line == "4" {
		fmt.Println("(Use comma to separate between drive IDs.)")
		fmt.Printf("New %s access list of drives: ", targetListName)
		fmt.Scanln(&line)
		drives = strings.Split(line, ",")
		for i, drive := range drives {
			drives[i] = strings.TrimSpace(drive)
		}
		*targetList = drives
	} else if line == "5" {
		fmt.Printf("Converting from %s access list into %s access list...\n", targetListName, counterListName)
		*counterList = *targetList
		*targetList = nil
	} else if line == "6" {
		fmt.Println("Removing access control list from the user...")
		*counterList = nil
		*targetList = nil
	}
	return
}

func SaveUser(user *User) (err error) {
	var b []byte
	var userPath string
	if userPath, err = ComputeUserPath(user.Name); err != nil {
		return
	}
	fmt.Printf("Saving user to %s ...\n", userPath)
	if b, err = json.Marshal(&user); err != nil {
		return
	}
	if b, err = GCMEncrypt(Config.SecretKey, "user", b); err != nil {
		return
	}
	return ioutil.WriteFile(userPath, b, 0600)
}

func DeployGist(dir string, gistID string) (err error) {
	if err = os.MkdirAll(dir, 0700); err != nil {
		return
	}
	if _, err = os.Stat(filepath.Join(dir, ".git")); os.IsNotExist(err) {
		fmt.Printf("Initializing Git repo in %s...\n", dir)
		if err = InitGitRepo(
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

func InitGitRepo(dir string, httpsRemote string, sshRemote string) (err error) {
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

func DeployWorker() (err error) {
	b, err := ioutil.ReadFile("dist/worker.js")
	if err != nil {
		return
	}
	r := strings.NewReplacer(
		"__SECRET__", Config.SecretKey,
		"__ACCOUNTS_COUNT__", strconv.FormatUint(Config.AccountsCount, 10),
		"__ACCOUNT_ROTATION__", strconv.FormatUint(Config.AccountRotation, 10),
		"__ACCOUNT_CANDIDATES__", strconv.FormatUint(Config.AccountCandidates, 10),
		"__USERS_URL__", fmt.Sprintf("https://gist.githubusercontent.com/%s/%s/raw/", Config.GistUser, Config.GistID.Users),
		"__STATIC_URL__", fmt.Sprintf("https://gist.githubusercontent.com/%s/%s/raw/", Config.GistUser, Config.GistID.Static),
		"__ACCOUNTS_URL__", fmt.Sprintf("https://gist.githubusercontent.com/%s/%s/raw/", Config.GistUser, Config.GistID.Accounts),
	)
	script := r.Replace(string(b))
	fmt.Printf("Deploying Cloudflare Worker %s...\n", Config.CloudflareWorker)
	_, err = Cf.UploadWorker(&cloudflare.WorkerRequestParams{
		ScriptName: Config.CloudflareWorker,
	}, string(script))
	fmt.Printf("Now you can go to https://dash.cloudflare.com/%s/workers/view/%s to checkout your Worker!\n", Config.CloudflareAccount, Config.CloudflareWorker)
	fmt.Println("Check here to create custom routes with your own domain names:\nhttps://developers.cloudflare.com/workers/about/routes/")
	return
}

func SaveConfigFile() (err error) {
	b, err := json.Marshal(&Config)
	if err != nil {
		return
	}
	return ioutil.WriteFile(Config.ConfigFile, b, 0600)
}
