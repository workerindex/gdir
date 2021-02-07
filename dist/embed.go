package dist

import "embed"

// StaticFs stores the embedded resources
//go:embed static worker.js
var StaticFs embed.FS
