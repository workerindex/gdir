package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/crypto/ssh/terminal"
)

var args = struct {
	Key      string `json:"secret_key,omitempty"`
	newUser  user
	oldUser  user
	userPath string
}{}

type user struct {
	Name            string   `json:"name"`
	Pass            string   `json:"pass"`
	DrivesWhiteList []string `json:"drives_white_list,omitempty"`
	DrivesBlackList []string `json:"drives_black_list,omitempty"`
}

func init() {
	flag.StringVar(&args.newUser.Name, "user", "", "username")
	flag.StringVar(&args.newUser.Pass, "pass", "", "password")
}

func run() (err error) {
	flag.Parse()

	if err = readConfig(); err != nil {
		return
	}

	if args.Key == "" {
		flag.Usage()
		os.Exit(1)
	}

	if err = enterUsername(); err != nil {
		return
	}

	if err = computeUserPath(); err != nil {
		return
	}

	if err = readOldUser(); err != nil {
		return
	}

	if err = enterPassword(); err != nil {
		return
	}

	if err = configureUserAccess(); err != nil {
		return
	}

	if err = saveUser(); err != nil {
		return
	}

	fmt.Println("All done!")
	return
}

func readConfig() (err error) {
	var inBytes []byte
	var clone []byte

	if inBytes, err = ioutil.ReadFile("config.json"); err != nil {
		return
	}

	if clone, err = json.Marshal(&args); err != nil {
		return
	}

	if err = json.Unmarshal(inBytes, &args); err != nil {
		return
	}

	if err = json.Unmarshal(clone, &args); err != nil {
		return
	}

	return
}

func enterUsername() (err error) {
	if args.newUser.Name == "" {
		fmt.Printf("Username: ")
		fmt.Scanln(&args.newUser.Name)
	}
	return
}

func computeUserPath() (err error) {
	hash := sha256.New()
	hash.Write([]byte(args.Key))
	hash.Write([]byte(args.newUser.Name))
	args.userPath = filepath.Join("users", hex.EncodeToString(hash.Sum(nil)))
	return
}

func readOldUser() (err error) {
	var inBytes []byte
	if _, e := os.Stat(args.userPath); !os.IsNotExist(e) {
		// User already exists, read existing profile
		if inBytes, err = ioutil.ReadFile(args.userPath); err != nil {
			return
		}
		if err = json.Unmarshal(inBytes, &args.oldUser); err != nil {
			return
		}
	}
	return
}

func enterPassword() (err error) {
	var bytePassword []byte
	if args.oldUser.Pass != "" && args.newUser.Pass == "" {
		fmt.Println("Password:", args.oldUser.Pass)
		if promptYesNoWithDefault("Is it correct?", true) {
			args.newUser.Pass = args.oldUser.Pass
		}
	}
	if args.newUser.Pass == "" {
		fmt.Printf("Password: ")
		bytePassword, err = terminal.ReadPassword(int(syscall.Stdin))
		if err != nil {
			return
		}
		fmt.Println()
		args.newUser.Pass = string(bytePassword)
	}
	return
}

func configureUserAccess() (err error) {

	args.newUser.DrivesWhiteList = args.oldUser.DrivesWhiteList
	args.newUser.DrivesBlackList = args.oldUser.DrivesBlackList

	for {
		var confirmed bool
		if len(args.newUser.DrivesWhiteList) > 0 {
			if confirmed, err = configureAccessList("white-list", &args.newUser.DrivesWhiteList, "black-list", &args.newUser.DrivesBlackList); err != nil {
				return
			}
			if confirmed {
				break
			}
		} else if len(args.newUser.DrivesBlackList) > 0 {
			if confirmed, err = configureAccessList("black-list", &args.newUser.DrivesBlackList, "white-list", &args.newUser.DrivesWhiteList); err != nil {
				return
			}
			if confirmed {
				break
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
			if line == "1" {
				break
			} else if line == "2" {
				fmt.Println("(Use comma to separate between drive IDs.)")
				fmt.Printf("Enter white-list access control list of drives: ")
				fmt.Scanln(&line)
				drives = strings.Split(line, ",")
				for i, drive := range drives {
					drives[i] = strings.TrimSpace(drive)
				}
				args.newUser.DrivesWhiteList = drives
			} else if line == "3" {
				fmt.Println("(Use comma to separate between drive IDs.)")
				fmt.Printf("Enter black-list access control list of drives: ")
				fmt.Scanln(&line)
				drives = strings.Split(line, ",")
				for i, drive := range drives {
					drives[i] = strings.TrimSpace(drive)
				}
				args.newUser.DrivesBlackList = drives
			}
		}
	}
	return
}

func configureAccessList(targetListName string, targetList *[]string, counterListName string, counterList *[]string) (confirmed bool, err error) {
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
	if line == "1" {
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

func saveUser() (err error) {
	var b []byte
	fmt.Printf("Saving user to %s ...\n", args.userPath)
	if b, err = json.Marshal(&args.newUser); err != nil {
		return
	}
	if b, err = gcmEncrypt(args.Key, "user", b); err != nil {
		return
	}
	return ioutil.WriteFile(args.userPath, b, 0600)
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
