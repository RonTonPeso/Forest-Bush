provider "fly" {
  fly_api_token = var.fly_api_token
}

resource "fly_app" "forest_bush" {
  name = "forest-bush"
  org  = "personal"
}

resource "null_resource" "app_secrets" {
  depends_on = [fly_app.forest_bush]

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command = <<-EOT
      echo "===== SETUP AND SECRETS START ====="
      echo "Current directory: $(pwd)"
      
      # Create a directory for our binaries
      WORKSPACE_DIR="$(pwd)"
      BIN_DIR="$WORKSPACE_DIR/bin"
      mkdir -p "$BIN_DIR"
      chmod 755 "$BIN_DIR"
      
      echo "Created bin directory: $BIN_DIR"
      ls -la "$BIN_DIR"
      
      # Install flyctl directly to our bin directory
      echo "Installing flyctl..."
      curl -L https://fly.io/install.sh | FLYCTL_INSTALL="$BIN_DIR" sh
      
      # Find the flyctl binary
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
      
      # Set up authentication
      export FLY_API_TOKEN="${var.fly_api_token}"
      
      echo "Authenticating with Fly.io..."
      "$FLYCTL_BIN" auth token "$FLY_API_TOKEN"
      
      echo "Verifying authentication..."
      "$FLYCTL_BIN" auth whoami
      
      # Set the secrets
      echo "Setting secrets..."
      "$FLYCTL_BIN" secrets set DATABASE_URL='${var.db_url}' --app ${fly_app.forest_bush.name}
      "$FLYCTL_BIN" secrets set REDIS_URL='${var.redis_url}' --app ${fly_app.forest_bush.name}
      
      echo "===== SETUP AND SECRETS END ====="
    EOT
  }

  triggers = {
    db_url    = var.db_url
    redis_url = var.redis_url
  }
} 