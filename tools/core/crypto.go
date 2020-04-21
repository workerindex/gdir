package core

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
)

func GCMKey(secret string, namespace string) (key []byte) {
	hash := sha256.New()
	hash.Write([]byte(secret + ":" + namespace))
	key = hash.Sum(nil)
	return
}

func GCMCipher(secret string, namespace string) (c cipher.AEAD, err error) {
	block, err := aes.NewCipher(GCMKey(secret, namespace))
	if err != nil {
		return
	}
	return cipher.NewGCM(block)
}

func GCMEncrypt(secret string, namespace string, data []byte) (out []byte, err error) {
	gcm, err := GCMCipher(secret, namespace)
	if err != nil {
		return
	}
	out = make([]byte, 12, 12+len(data)+gcm.Overhead())
	rand.Read(out[:12])
	out = gcm.Seal(out, out[:12], data, nil)
	return
}

func GCMDecrypt(secret string, namespace string, data []byte) (out []byte, err error) {
	gcm, err := GCMCipher(secret, namespace)
	if err != nil {
		return
	}
	return gcm.Open(nil, data[:12], data[12:], nil)
}
