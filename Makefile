all: gdir

dirs:
	@mkdir -p build/win_x64
	@mkdir -p build/linux_x64
	@mkdir -p build/mac_x64

js:
	@npm run build

gdir: dirs js
	GOOS=windows GOARCH=amd64 go build -o build/win_x64/gdir.exe ./tools
	GOOS=linux GOARCH=amd64 go build -o build/linux_x64/gdir ./tools
	GOOS=darwin GOARCH=amd64 go build -o build/mac_x64/gdir ./tools

clean:
	@rm -rf build
	@npm run clean
