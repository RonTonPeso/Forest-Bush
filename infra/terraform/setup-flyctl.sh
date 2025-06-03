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
if [ -z "$TF_VAR_fly_api_token" ]; then
    echo "Error: TF_VAR_fly_api_token environment variable is not set"
    echo "Please set it using: export TF_VAR_fly_api_token=your_token_here"
    exit 1
fi

# Authenticate using the token
echo "Authenticating with Fly.io..."
echo "$TF_VAR_fly_api_token" | flyctl auth token

# List available organizations
echo "Available organizations:"
flyctl orgs list 