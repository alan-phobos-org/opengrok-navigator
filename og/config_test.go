package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadConfigNonExistent(t *testing.T) {
	// Save the original function and restore after test
	oldGetConfigPath := getConfigPath
	defer func() { getConfigPath = oldGetConfigPath }()

	// Override getConfigPath to return a non-existent file
	tmpDir := t.TempDir()
	getConfigPath = func() (string, error) {
		return filepath.Join(tmpDir, "nonexistent.json"), nil
	}

	config, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig should not error for non-existent file: %v", err)
	}
	if config != nil {
		t.Error("Expected nil config for non-existent file")
	}
}

func TestSaveAndLoadConfig(t *testing.T) {
	// Save the original function and restore after test
	oldGetConfigPath := getConfigPath
	defer func() { getConfigPath = oldGetConfigPath }()

	// Override getConfigPath to use a temp file
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "test-config.json")
	getConfigPath = func() (string, error) {
		return configFile, nil
	}

	// Test config to save
	testConfig := &Config{
		ServerURL:   "https://example.com/source",
		Username:    "testuser",
		Password:    "testpass",
		APIKey:      "test-api-key",
		BearerToken: "test-bearer-token",
		WebLinks:    true,
	}

	// Save config
	err := SaveConfig(testConfig)
	if err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}

	// Verify file exists and has correct permissions
	info, err := os.Stat(configFile)
	if err != nil {
		t.Fatalf("Config file should exist: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Errorf("Config file should have 0600 permissions, got %o", info.Mode().Perm())
	}

	// Load config
	loaded, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}
	if loaded == nil {
		t.Fatal("Expected non-nil config")
	}

	// Verify all fields match
	if loaded.ServerURL != testConfig.ServerURL {
		t.Errorf("ServerURL: got %q, want %q", loaded.ServerURL, testConfig.ServerURL)
	}
	if loaded.Username != testConfig.Username {
		t.Errorf("Username: got %q, want %q", loaded.Username, testConfig.Username)
	}
	if loaded.Password != testConfig.Password {
		t.Errorf("Password: got %q, want %q", loaded.Password, testConfig.Password)
	}
	if loaded.APIKey != testConfig.APIKey {
		t.Errorf("APIKey: got %q, want %q", loaded.APIKey, testConfig.APIKey)
	}
	if loaded.BearerToken != testConfig.BearerToken {
		t.Errorf("BearerToken: got %q, want %q", loaded.BearerToken, testConfig.BearerToken)
	}
	if loaded.WebLinks != testConfig.WebLinks {
		t.Errorf("WebLinks: got %v, want %v", loaded.WebLinks, testConfig.WebLinks)
	}
}

func TestLoadConfigInvalidJSON(t *testing.T) {
	// Save the original function and restore after test
	oldGetConfigPath := getConfigPath
	defer func() { getConfigPath = oldGetConfigPath }()

	// Override getConfigPath to use a temp file
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "invalid.json")
	getConfigPath = func() (string, error) {
		return configFile, nil
	}

	// Write invalid JSON
	err := os.WriteFile(configFile, []byte("{ invalid json }"), 0600)
	if err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	// Load should fail
	_, err = LoadConfig()
	if err == nil {
		t.Error("LoadConfig should error for invalid JSON")
	}
}

func TestSaveConfigEmptyFields(t *testing.T) {
	// Save the original function and restore after test
	oldGetConfigPath := getConfigPath
	defer func() { getConfigPath = oldGetConfigPath }()

	// Override getConfigPath to use a temp file
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "empty-fields.json")
	getConfigPath = func() (string, error) {
		return configFile, nil
	}

	// Config with only required field
	testConfig := &Config{
		ServerURL: "https://example.com",
	}

	err := SaveConfig(testConfig)
	if err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}

	// Load and verify
	loaded, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if loaded.ServerURL != testConfig.ServerURL {
		t.Errorf("ServerURL: got %q, want %q", loaded.ServerURL, testConfig.ServerURL)
	}
	if loaded.Username != "" {
		t.Errorf("Username should be empty, got %q", loaded.Username)
	}
	if loaded.WebLinks != false {
		t.Errorf("WebLinks should be false, got %v", loaded.WebLinks)
	}
}

func TestConfigJSONFormat(t *testing.T) {
	// Verify that omitempty works correctly
	config := &Config{
		ServerURL: "https://example.com",
		// Leave other fields empty
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	// Should only contain server_url field, not empty auth fields
	jsonStr := string(data)
	if !strings.Contains(jsonStr, "server_url") {
		t.Error("JSON should contain server_url")
	}
	// omitempty fields should not appear when empty
	if strings.Contains(jsonStr, "username") {
		t.Error("JSON should not contain empty username field (omitempty)")
	}
	if strings.Contains(jsonStr, "api_key") {
		t.Error("JSON should not contain empty api_key field (omitempty)")
	}
}
