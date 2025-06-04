terraform {
  required_version = "~> 1.12.0"
  
  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = "0.0.23"
    }
  }

  cloud {
    organization = "Ronton"
    workspaces {
      name = "forest-bush"
    }
  }
} 