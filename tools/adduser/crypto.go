package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
)

func gcmKey(secret string, namespace string) (key []byte) {
	hash := sha256.New()
	hash.Write([]byte(secret + ":" + namespace))
	key = hash.Sum(nil)
	return
}

func gcmCipher(secret string, namespace string) (c cipher.AEAD, err error) {
	block, err := aes.NewCipher(gcmKey(secret, namespace))
	if err != nil {
		return
	}
	return cipher.NewGCM(block)
}

func gcmEncrypt(secret string, namespace string, data []byte) (out []byte, err error) {
	gcm, err := gcmCipher(secret, namespace)
	if err != nil {
		return
	}
	out = make([]byte, 12, 12+len(data)+gcm.Overhead())
	rand.Read(out[:12])
	out = gcm.Seal(out, out[:12], data, nil)
	return
}
