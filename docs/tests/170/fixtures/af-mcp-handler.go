// Local-only contract fixture. Run from an AF source checkout; it deliberately
// constructs the real MCP handler without its router, auth, bridge or backends.
package main

import (
	"fmt"
	"log"
	"net"
	"net/http"

	"github.com/jordigilh/kubernaut/pkg/apifrontend/handler"
)

func main() {
	h, err := handler.NewMCPHandler(handler.MCPConfig{
		ServerName: "synthetic-af", ServerVersion: "test", Enabled: true,
		Tools: []handler.MCPToolDef{{Name: "synthetic_read", Description: "local stub", InputSchema: map[string]any{"type": "object", "properties": map[string]any{}}}},
	})
	if err != nil {
		log.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("http://%s\n", listener.Addr())
	log.Fatal(http.Serve(listener, h)) // test-only loopback server
}
