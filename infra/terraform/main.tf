provider "fly" {
  fly_api_token = var.fly_api_token
}

resource "fly_app" "forest_bush" {
  name = "forest-bush"
  org  = "personal"
}

resource "null_resource" "flyctl_setup" {
  depends_on = [fly_app.forest_bush]

  provisioner "local-exec" {
    command = "${path.module}/setup-flyctl.sh"
  }
}

resource "null_resource" "app_secrets" {
  depends_on = [fly_app.forest_bush, null_resource.flyctl_setup]

  provisioner "local-exec" {
    command = <<-EOT
      echo "===== APP SECRETS PROVISIONER START ====="
      echo "Current directory: \$(pwd)"
      echo "Home directory: \$HOME"
      
      # Get the flyctl path from the file
      WORKSPACE_DIR="\$(pwd)"
      FLYCTL_PATH_FILE="\$WORKSPACE_DIR/.flyctl_path"
      echo "Looking for flyctl path in: \$FLYCTL_PATH_FILE"
      echo "Contents of workspace directory:"
      ls -la "\$WORKSPACE_DIR"
      
      if [ ! -f "\$FLYCTL_PATH_FILE" ]; then
        echo "Error: flyctl path file not found at \$FLYCTL_PATH_FILE"
        exit 1
      fi
      
      FLYCTL_BIN=\$(cat "\$FLYCTL_PATH_FILE")
      echo "Using flyctl from: \$FLYCTL_BIN"
      
      if [ ! -x "\$FLYCTL_BIN" ]; then
        echo "Error: flyctl binary not executable at \$FLYCTL_BIN"
        ls -l "\$FLYCTL_BIN"
        chmod +x "\$FLYCTL_BIN"
      fi
      
      # Set the secrets using the full path to flyctl
      echo "Setting secrets..."
      "\$FLYCTL_BIN" secrets set DATABASE_URL='${var.db_url}' --app ${fly_app.forest_bush.name}
      "\$FLYCTL_BIN" secrets set REDIS_URL='${var.redis_url}' --app ${fly_app.forest_bush.name}
      
      echo "===== APP SECRETS PROVISIONER END ====="
    EOT
  }

  triggers = {
    db_url    = var.db_url
    redis_url = var.redis_url
  }
} 