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
      # Find flyctl install location
      if [ -d "$HOME/.fly" ]; then
        export FLYCTL_INSTALL="$HOME/.fly"
      elif [ -d "/usr/local/lib/flyctl" ]; then
        export FLYCTL_INSTALL="/usr/local/lib/flyctl"
      else
        export FLYCTL_INSTALL="$(find $HOME -type d -name '.fly' | head -n 1)"
      fi
      export PATH="$FLYCTL_INSTALL/bin:$PATH"
      flyctl secrets set DATABASE_URL='${var.db_url}' --app ${fly_app.forest_bush.name}
      flyctl secrets set REDIS_URL='${var.redis_url}' --app ${fly_app.forest_bush.name}
    EOT
  }

  triggers = {
    db_url    = var.db_url
    redis_url = var.redis_url
  }
} 