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
echo "$FLY_API_TOKEN" | flyctl auth token

# Verify authentication
echo "Verifying authentication..."
flyctl auth whoami

# List available organizations
echo "Available organizations:"
flyctl orgs list 