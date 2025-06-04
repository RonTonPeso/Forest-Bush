#!/bin/bash
set -e

echo "===== SETUP FLYCTL SCRIPT START ====="
echo "Current PATH: $PATH"
echo "Current directory: $(pwd)"
echo "Script location: $0"
echo "Home directory: $HOME"

# Create a directory in the workspace for our binaries
WORKSPACE_DIR="$(pwd)"
BIN_DIR="$WORKSPACE_DIR/bin"
mkdir -p "$BIN_DIR"
chmod 755 "$BIN_DIR"

echo "Created bin directory: $BIN_DIR"
ls -la "$BIN_DIR"

# Install flyctl directly to our bin directory
echo "Installing flyctl..."
curl -L https://fly.io/install.sh | FLYCTL_INSTALL="$BIN_DIR" sh

# Ensure flyctl is in our new bin directory
FLYCTL_BIN="$BIN_DIR/bin/flyctl"
if [ ! -f "$FLYCTL_BIN" ]; then
    echo "Error: flyctl binary not found at expected location: $FLYCTL_BIN"
    echo "Contents of $BIN_DIR:"
    ls -la "$BIN_DIR"
    echo "Contents of $BIN_DIR/bin (if exists):"
    ls -la "$BIN_DIR/bin" || echo "bin subdirectory does not exist"
    exit 1
fi

# Make the binary executable
chmod +x "$FLYCTL_BIN"
echo "Made flyctl executable: $FLYCTL_BIN"
ls -l "$FLYCTL_BIN"

# Store the flyctl path
FLYCTL_PATH_FILE="$WORKSPACE_DIR/.flyctl_path"
echo "$FLYCTL_BIN" > "$FLYCTL_PATH_FILE"
chmod 644 "$FLYCTL_PATH_FILE"

echo "Stored flyctl path in: $FLYCTL_PATH_FILE"
echo "Contents of $FLYCTL_PATH_FILE:"
cat "$FLYCTL_PATH_FILE"

# Check if TF_VAR_fly_api_token is set
if [ -z "$TF_VAR_fly_api_token" ]; then
    echo "Error: TF_VAR_fly_api_token environment variable is not set"
    echo "Please set it using: export TF_VAR_fly_api_token=your_token_here"
    exit 1
fi

# Set FLY_API_TOKEN from TF_VAR_fly_api_token
export FLY_API_TOKEN="$TF_VAR_fly_api_token"

# Authenticate using the token
echo "Authenticating with Fly.io..."
"$FLYCTL_BIN" auth token "$FLY_API_TOKEN"

# Verify authentication
echo "Verifying authentication..."
"$FLYCTL_BIN" auth whoami

# List available organizations
echo "Available organizations:"
"$FLYCTL_BIN" orgs list

echo "===== SETUP FLYCTL SCRIPT END =====" 