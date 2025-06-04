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
      echo "Current PATH: $PATH"
      echo "Current directory: $(pwd)"
      echo "Home directory: $HOME"
      
      # Try to find flyctl
      echo "Searching for flyctl..."
      find $HOME -name flyctl 2>/dev/null || echo "Not found in HOME"
      find /usr/local -name flyctl 2>/dev/null || echo "Not found in /usr/local"
      
      # Set up PATH to include common flyctl locations
      export PATH="$HOME/.fly/bin:$PATH"
      export PATH="/usr/local/bin:$PATH"
      export PATH="$HOME/bin:$PATH"
      
      # Try to run flyctl version
      echo "Trying flyctl version..."
      flyctl version || echo "flyctl version failed"
      
      # Set the secrets
      echo "Setting secrets..."
      flyctl secrets set DATABASE_URL='${var.db_url}' --app ${fly_app.forest_bush.name}
      flyctl secrets set REDIS_URL='${var.redis_url}' --app ${fly_app.forest_bush.name}
    EOT
  }

  triggers = {
    db_url    = var.db_url
    redis_url = var.redis_url
  }
} 