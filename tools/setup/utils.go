package main

import (
	"fmt"
	"regexp"
)

func promptYesNo(question string) bool {
	var line string
	for {
		fmt.Printf("%s (y/n) ", question)
		fmt.Scanln(&line)
		if regexp.MustCompile(`(?i)^\s*y\s*$`).MatchString(line) {
			return true
		} else if regexp.MustCompile(`(?i)^\s*n\s*$`).MatchString(line) {
			return false
		}
	}
}

func promptYesNoWithDefault(question string, defaultYes bool) bool {
	var line string
	for {
		fmt.Printf("%s (", question)
		if defaultYes {
			fmt.Printf("Y/n) ")
		} else {
			fmt.Printf("y/N) ")
		}
		fmt.Scanln(&line)
		if regexp.MustCompile(`(?i)^\s*$`).MatchString(line) {
			return defaultYes
		} else if regexp.MustCompile(`(?i)^\s*y\s*$`).MatchString(line) {
			return true
		} else if regexp.MustCompile(`(?i)^\s*n\s*$`).MatchString(line) {
			return false
		}
	}
}
