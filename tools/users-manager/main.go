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
	"log"
	"os"
	"strings"
)

var args = struct {
	Key             string
	User            user
	DrivesWhiteList string
	DrivesBlackList string
}{}

type user struct {
	Name            string   `json:"name"`
	Pass            string   `json:"pass"`
	DrivesWhiteList []string `json:"drives_white_list,omitempty"`
	DrivesBlackList []string `json:"drives_black_list,omitempty"`
}

func init() {
	flag.StringVar(&args.Key, "key", "", "encryption key")
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
	var iv []byte
	var outBytes []byte
	var outPath string
	var outFile *os.File

	flag.Parse()

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
	outPath = hex.EncodeToString(hash.Sum(nil))

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

	iv = make([]byte, 12)
	rand.Read(iv)

	if args.DrivesWhiteList != "" {
		args.User.DrivesWhiteList = strings.Split(args.DrivesWhiteList, ",")
	}

	if args.DrivesBlackList != "" {
		args.User.DrivesBlackList = strings.Split(args.DrivesBlackList, ",")
	}

	outBytes, err = json.Marshal(args.User)
	if err != nil {
		return
	}

	outBytes = aead.Seal(nil, iv, outBytes, nil)

	outFile, err = os.OpenFile(outPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	_, err = outFile.Write(iv)
	if err != nil {
		return
	}
	_, err = outFile.Write(outBytes)
	if err != nil {
		return
	}
	err = outFile.Close()
	if err != nil {
		return
	}

	return
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
