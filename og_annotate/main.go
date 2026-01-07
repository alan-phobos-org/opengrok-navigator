package main

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"log"
	"os"
)

// Request represents an incoming message from Chrome
type Request struct {
	Action string `json:"action"`
	// For read/write operations
	StoragePath string `json:"storagePath,omitempty"`
	Project     string `json:"project,omitempty"`
	FilePath    string `json:"filePath,omitempty"`
	// For save operations
	Line       int      `json:"line,omitempty"`
	Author     string   `json:"author,omitempty"`
	Text       string   `json:"text,omitempty"`
	Context    []string `json:"context,omitempty"` // 7 lines: 3 before + annotated + 3 after
	// For edit tracking
	User string `json:"user,omitempty"`
}

// Response represents an outgoing message to Chrome
type Response struct {
	Success     bool         `json:"success"`
	Error       string       `json:"error,omitempty"`
	Annotations []Annotation `json:"annotations,omitempty"`
	Editing     []EditEntry  `json:"editing,omitempty"`
}

func main() {
	// Disable log timestamps for cleaner output
	log.SetFlags(0)

	for {
		// Read message length (4 bytes, little-endian)
		var length uint32
		if err := binary.Read(os.Stdin, binary.LittleEndian, &length); err != nil {
			if err == io.EOF {
				return
			}
			sendError("Failed to read message length: " + err.Error())
			continue
		}

		// Sanity check on length
		if length > 1024*1024 {
			sendError("Message too large")
			continue
		}

		// Read message body
		msg := make([]byte, length)
		if _, err := io.ReadFull(os.Stdin, msg); err != nil {
			sendError("Failed to read message: " + err.Error())
			continue
		}

		// Parse request
		var req Request
		if err := json.Unmarshal(msg, &req); err != nil {
			sendError("Failed to parse request: " + err.Error())
			continue
		}

		// Handle request
		resp := handleRequest(req)
		sendResponse(resp)
	}
}

func handleRequest(req Request) Response {
	switch req.Action {
	case "ping":
		return Response{Success: true}

	case "read":
		if req.StoragePath == "" || req.Project == "" || req.FilePath == "" {
			return Response{Success: false, Error: "Missing required fields: storagePath, project, filePath"}
		}
		annotations, err := ReadAnnotations(req.StoragePath, req.Project, req.FilePath)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true, Annotations: annotations}

	case "save":
		if req.StoragePath == "" || req.Project == "" || req.FilePath == "" {
			return Response{Success: false, Error: "Missing required fields: storagePath, project, filePath"}
		}
		if req.Line <= 0 || req.Author == "" || req.Text == "" {
			return Response{Success: false, Error: "Missing required fields: line, author, text"}
		}
		err := SaveAnnotation(req.StoragePath, req.Project, req.FilePath, req.Line, req.Author, req.Text, req.Context)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true}

	case "delete":
		if req.StoragePath == "" || req.Project == "" || req.FilePath == "" {
			return Response{Success: false, Error: "Missing required fields: storagePath, project, filePath"}
		}
		if req.Line <= 0 {
			return Response{Success: false, Error: "Missing required field: line"}
		}
		err := DeleteAnnotation(req.StoragePath, req.Project, req.FilePath, req.Line)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true}

	case "startEditing":
		if req.StoragePath == "" || req.User == "" || req.FilePath == "" {
			return Response{Success: false, Error: "Missing required fields: storagePath, user, filePath"}
		}
		err := StartEditing(req.StoragePath, req.User, req.FilePath, req.Line)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true}

	case "stopEditing":
		if req.StoragePath == "" || req.User == "" {
			return Response{Success: false, Error: "Missing required fields: storagePath, user"}
		}
		err := StopEditing(req.StoragePath, req.User)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true}

	case "getEditing":
		if req.StoragePath == "" {
			return Response{Success: false, Error: "Missing required field: storagePath"}
		}
		entries, err := GetEditing(req.StoragePath)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true, Editing: entries}

	case "listAnnotatedFiles":
		if req.StoragePath == "" || req.Project == "" {
			return Response{Success: false, Error: "Missing required fields: storagePath, project"}
		}
		annotations, err := ListAnnotatedFiles(req.StoragePath, req.Project)
		if err != nil {
			return Response{Success: false, Error: err.Error()}
		}
		return Response{Success: true, Annotations: annotations}

	default:
		return Response{Success: false, Error: "Unknown action: " + req.Action}
	}
}

func sendResponse(resp Response) {
	data, err := json.Marshal(resp)
	if err != nil {
		sendError("Failed to marshal response: " + err.Error())
		return
	}

	// Write length prefix
	length := uint32(len(data))
	if err := binary.Write(os.Stdout, binary.LittleEndian, length); err != nil {
		return
	}

	// Write message
	os.Stdout.Write(data)
}

func sendError(msg string) {
	resp := Response{Success: false, Error: msg}
	data, _ := json.Marshal(resp)
	length := uint32(len(data))
	binary.Write(os.Stdout, binary.LittleEndian, length)
	os.Stdout.Write(data)
}
