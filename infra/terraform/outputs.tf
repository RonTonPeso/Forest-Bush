output "app_name" {
  description = "The name of the Fly.io application"
  value       = fly_app.forest_bush.name
}

output "app_org" {
  description = "The organization the Fly.io application belongs to"
  value       = fly_app.forest_bush.org
}

output "app_hostname" {
  description = "The hostname of the Fly.io application"
  value       = "${fly_app.forest_bush.name}.fly.dev"
}

output "database_url" {
  description = "The PostgreSQL database URL"
  value       = var.db_url
  sensitive   = true
}

output "redis_url" {
  description = "The Redis connection URL"
  value       = var.redis_url
  sensitive   = true
} 