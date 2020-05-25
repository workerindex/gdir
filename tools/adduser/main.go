package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"syscall"

	"github.com/workerindex/gdir/tools/core"
	"golang.org/x/crypto/ssh/terminal"
)

var args = struct {
	newUser  core.User
	oldUser  core.User
	userPath string
}{}

func init() {
	flag.StringVar(&core.Config.ConfigFile, "config", "config.json", "config file to read and write")
	flag.StringVar(&core.Config.SecretKey, "key", "", "gdir master secret key to derive other encryption keys")
	flag.StringVar(&args.newUser.Name, "user", "", "username")
	flag.StringVar(&args.newUser.Pass, "pass", "", "password")
}

func run() (err error) {
	flag.Parse()

	if err = core.LoadConfigFile(); err != nil {
		return
	}

	if core.Config.SecretKey == "" {
		flag.Usage()
		os.Exit(1)
	}

	if err = enterUsername(); err != nil {
		return
	}

	if args.userPath, err = core.ComputeUserPath(args.newUser.Name); err != nil {
		return
	}

	if err = readOldUser(); err != nil {
		return
	}

	if err = enterPassword(); err != nil {
		return
	}

	if err = core.ConfigureUserAccess(&args.newUser); err != nil {
		return
	}

	if err = core.SaveUser(&args.newUser); err != nil {
		return
	}

	if err = core.DeployGist("users", core.Config.GistID.Users); err != nil {
		return
	}

	fmt.Println("All done!")
	return
}

func enterUsername() (err error) {
	if args.newUser.Name == "" {
		fmt.Printf("Username: ")
		fmt.Scanln(&args.newUser.Name)
	}
	return
}

func readOldUser() (err error) {
	var inBytes []byte
	if _, e := os.Stat(args.userPath); !os.IsNotExist(e) {
		// User already exists, read existing profile
		if inBytes, err = ioutil.ReadFile(args.userPath); err != nil {
			return
		}
		if inBytes, err = core.GCMDecrypt(core.Config.SecretKey, "user", inBytes); err != nil {
			return
		}
		if err = json.Unmarshal(inBytes, &args.oldUser); err != nil {
			return
		}
		args.newUser.DrivesWhiteList = args.oldUser.DrivesWhiteList
		args.newUser.DrivesBlackList = args.oldUser.DrivesBlackList
	}
	return
}

func enterPassword() (err error) {
	var bytePassword []byte
	if args.oldUser.Pass != "" && args.newUser.Pass == "" {
		fmt.Println("Password:", args.oldUser.Pass)
		if core.PromptYesNoWithDefault("Is it correct?", true) {
			args.newUser.Pass = args.oldUser.Pass
		}
	}
	if args.newUser.Pass == "" {
		for loop := true; loop; loop = args.newUser.Pass == "" {
			fmt.Printf("Password: ")
			bytePassword, err = terminal.ReadPassword(int(syscall.Stdin))
			if err != nil {
				return
			}
			fmt.Println()
			args.newUser.Pass = string(bytePassword)
		}
	}
	return
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
