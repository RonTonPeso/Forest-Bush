output "app_name" {
  description = "The name of the Fly.io application"
  value       = fly_app.forest_bush.name
}

output "app_org" {
  description = "The organization the Fly.io application belongs to"
  value       = fly_app.forest_bush.org
} 