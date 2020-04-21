package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"hash"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"
)

var args = struct {
	Key             string `json:"secret_key,omitempty"`
	User            user   `json:"-"`
	DrivesWhiteList string `json:"-"`
	DrivesBlackList string `json:"-"`
}{}

type user struct {
	Name            string   `json:"name"`
	Pass            string   `json:"pass"`
	DrivesWhiteList []string `json:"drives_white_list,omitempty"`
	DrivesBlackList []string `json:"drives_black_list,omitempty"`
}

func init() {
	flag.StringVar(&args.User.Name, "user", "", "username")
	flag.StringVar(&args.User.Pass, "pass", "", "password")
	flag.StringVar(&args.DrivesWhiteList, "drive-white-list", "", "comma separated list of drive IDs")
	flag.StringVar(&args.DrivesBlackList, "drive-black-list", "", "comma separated list of drive IDs")
}

func run() (err error) {
	var key []byte
	var hash hash.Hash
	var block cipher.Block
	var aead cipher.AEAD
	var inBytes []byte
	var outBytes []byte
	var outName string

	flag.Parse()

	if inBytes, err = ioutil.ReadFile("config.json"); err != nil {
		return
	}

	if err = json.Unmarshal(inBytes, &args); err != nil {
		return
	}

	if args.Key == "" || args.User.Name == "" || args.User.Pass == "" {
		flag.Usage()
		os.Exit(1)
	}

	hash = sha256.New()
	hash.Write([]byte(args.Key + ":" + "user"))
	key = hash.Sum(nil)

	hash = sha256.New()
	hash.Write([]byte(args.Key))
	hash.Write([]byte(args.User.Name))
	outName = hex.EncodeToString(hash.Sum(nil))

	block, err = aes.NewCipher(key)
	if err != nil {
		return
	}

	aead, err = cipher.NewGCM(block)
	if err != nil {
		return
	}

	if aead.NonceSize() != 12 {
		err = fmt.Errorf("nonce size expect to be 12 by actually is %d", aead.NonceSize())
	}

	inBytes, err = json.Marshal(args.User)
	if err != nil {
		return
	}

	outBytes = make([]byte, 12, 12+len(outBytes)+aead.Overhead())
	rand.Read(outBytes[:12])

	if args.DrivesWhiteList != "" {
		args.User.DrivesWhiteList = strings.Split(args.DrivesWhiteList, ",")
	}

	if args.DrivesBlackList != "" {
		args.User.DrivesBlackList = strings.Split(args.DrivesBlackList, ",")
	}

	outBytes = aead.Seal(outBytes, outBytes[:12], inBytes, nil)
	return ioutil.WriteFile(filepath.Join("users", outName), outBytes, 0600)
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
