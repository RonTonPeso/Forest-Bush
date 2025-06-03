#!/bin/bash
set -e

# Check if flyctl is already installed
if ! command -v flyctl &> /dev/null; then
    echo "Installing flyctl..."
    curl -L https://fly.io/install.sh | sh
    
    # Add flyctl to PATH for the current session
    export FLYCTL_INSTALL="/usr/local/lib/flyctl"
    export PATH="$FLYCTL_INSTALL/bin:$PATH"
fi

# Check if FLY_API_TOKEN is set
if [ -z "$FLY_API_TOKEN" ]; then
    echo "Error: FLY_API_TOKEN environment variable is not set"
    echo "Please set it using: export FLY_API_TOKEN=your_token_here"
    exit 1
fi

# Authenticate using the token
echo "Authenticating with Fly.io..."
echo "$FLY_API_TOKEN" | flyctl auth token 