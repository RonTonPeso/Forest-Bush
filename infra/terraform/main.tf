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
      echo "HOME is: $HOME"
      echo "PATH is: $PATH"
      echo "Listing $HOME:"
      ls -al $HOME
      echo "Searching for flyctl in $HOME:"
      find $HOME -name flyctl
      echo "Searching for flyctl in /usr/local/lib:"
      find /usr/local/lib -name flyctl 2>/dev/null || true
      echo "Which flyctl:"
      which flyctl || true
      echo "Command -v flyctl:"
      command -v flyctl || true
      echo "Trying to run flyctl version:"
      flyctl version || true
      # Now try the secrets commands
      flyctl secrets set DATABASE_URL='${var.db_url}' --app ${fly_app.forest_bush.name} || true
      flyctl secrets set REDIS_URL='${var.redis_url}' --app ${fly_app.forest_bush.name} || true
    EOT
  }

  triggers = {
    db_url    = var.db_url
    redis_url = var.redis_url
  }
} 