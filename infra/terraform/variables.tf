variable "fly_api_token" {
  description = "Fly.io API token for authentication"
  type        = string
  sensitive   = true
}

variable "db_url" {
  description = "PostgreSQL database connection URL"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis connection URL"
  type        = string
  sensitive   = true
} 