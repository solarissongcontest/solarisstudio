import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const userId = 'a73ae43c-3ae6-4910-88b9-c4f424b75030'

const { data, error } = await supabase.auth.admin.updateUserById(
  userId,
  {
    email: 'enisalukovic@gmail.com',
    email_confirm: true,
  }
)

if (error) {
  console.error('Failed:', error)
  process.exit(1)
}

console.log('Updated user:', data.user.id)
console.log('New email:', data.user.email)
