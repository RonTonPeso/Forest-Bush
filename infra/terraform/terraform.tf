terraform {
  backend "remote" {
    organization = "Ronton"

    workspaces {
      name = "forest-bush"
    }
  }

  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.0.23"
    }
  }
} 