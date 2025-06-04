#!/bin/bash
set -e

echo "===== SETUP FLYCTL SCRIPT START ====="
echo "Current PATH: $PATH"
echo "Current directory: $(pwd)"
echo "Script location: $0"
echo "Home directory: $HOME"

# Create a file to store the flyctl path in a location we know exists
FLYCTL_PATH_FILE="/tmp/flyctl_path.txt"
echo "Will store flyctl path in: $FLYCTL_PATH_FILE"

# Check if flyctl is already installed
if ! command -v flyctl &> /dev/null; then
    echo "Installing flyctl..."
    curl -L https://fly.io/install.sh | sh

    # Detect install location (Linux vs Mac vs Terraform Cloud)
    if [ -d "$HOME/.fly" ]; then
        export FLYCTL_INSTALL="$HOME/.fly"
        echo "Found flyctl in $HOME/.fly"
    elif [ -d "/usr/local/lib/flyctl" ]; then
        export FLYCTL_INSTALL="/usr/local/lib/flyctl"
        echo "Found flyctl in /usr/local/lib/flyctl"
    else
        # Fallback for Terraform Cloud ephemeral home
        export FLYCTL_INSTALL="$(find $HOME -type d -name '.fly' | head -n 1)"
        echo "Found flyctl in $FLYCTL_INSTALL"
    fi
    export PATH="$FLYCTL_INSTALL/bin:$PATH"
    echo "Updated PATH: $PATH"
fi

# If flyctl still isn't found, try to set PATH again (for already-installed case)
if ! command -v flyctl &> /dev/null; then
    echo "flyctl not found after install, trying to locate it..."
    if [ -d "$HOME/.fly" ]; then
        export FLYCTL_INSTALL="$HOME/.fly"
    elif [ -d "/usr/local/lib/flyctl" ]; then
        export FLYCTL_INSTALL="/usr/local/lib/flyctl"
    else
        export FLYCTL_INSTALL="$(find $HOME -type d -name '.fly' | head -n 1)"
    fi
    export PATH="$FLYCTL_INSTALL/bin:$PATH"
    echo "Updated PATH again: $PATH"
fi

# Record the flyctl location
echo "Searching for flyctl binary..."
FLYCTL_BIN=$(command -v flyctl || find $HOME -name flyctl -type f | head -n 1)
if [ -n "$FLYCTL_BIN" ]; then
    echo "Found flyctl at: $FLYCTL_BIN"
    echo "$FLYCTL_BIN" > "$FLYCTL_PATH_FILE"
    chmod +x "$FLYCTL_BIN"
    echo "Recorded flyctl path to $FLYCTL_PATH_FILE"
    echo "Contents of $FLYCTL_PATH_FILE:"
    cat "$FLYCTL_PATH_FILE"
    ls -l "$FLYCTL_PATH_FILE"
else
    echo "Error: Could not find flyctl binary"
    exit 1
fi

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