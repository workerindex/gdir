package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
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
	Key string
	In  string
	Out string
}{}

func init() {
	flag.StringVar(&args.Key, "key", "", "encryption key")
	flag.StringVar(&args.In, "in", "", "accounts input dir")
	flag.StringVar(&args.Out, "out", ".", "accounts output dir")
}

func run() (err error) {
	var key []byte
	var hash hash.Hash
	var block cipher.Block
	var aead cipher.AEAD
	var iv []byte
	var inBytes []byte
	var outBytes []byte
	var inPath string
	var outPath string
	var outFile *os.File

	flag.Parse()

	if args.Key == "" || args.In == "" || args.Out == "" {
		flag.Usage()
		os.Exit(1)
	}

	hash = sha256.New()
	hash.Write([]byte(args.Key + ":" + "account"))
	key = hash.Sum(nil)

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

	files, err := ioutil.ReadDir(args.In)
	if err != nil {
		return
	}

	for i, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".json") && file.Size() > 0 {
			inPath = filepath.Join(args.In, file.Name())
			log.Printf("%d: %s", i, inPath)

			inBytes, err = ioutil.ReadFile(inPath)
			if err != nil {
				return
			}

			iv = make([]byte, 12)
			rand.Read(iv)

			outBytes = aead.Seal(nil, iv, inBytes, nil)

			outPath = filepath.Join(args.Out, fmt.Sprintf("%d", i))
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
		}
	}

	return
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
