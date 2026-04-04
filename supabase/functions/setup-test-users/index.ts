import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface TestUserSetup {
  email: string;
  password: string;
  fullName: string;
  isAdmin?: boolean;
}

const TEST_USERS: TestUserSetup[] = [
  {
    email: 'test-user@aynn.io',
    password: 'TestPassword123!',
    fullName: 'Test User',
    isAdmin: false,
  },
  {
    email: 'test-admin@aynn.io',
    password: 'AdminPassword123!',
    fullName: 'Test Admin',
    isAdmin: true,
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role client for admin operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const results: Array<{ email: string; status: string; message: string }> = [];

    for (const testUser of TEST_USERS) {
      try {
        // Check if user already exists
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const userExists = existingUsers?.users?.some(u => u.email === testUser.email);

        if (userExists) {
          results.push({
            email: testUser.email,
            status: 'exists',
            message: 'User already exists',
          });
          continue;
        }

        // Create user with admin API
        const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: testUser.email,
          password: testUser.password,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            full_name: testUser.fullName,
          },
        });

        if (createError) {
          results.push({
            email: testUser.email,
            status: 'error',
            message: createError.message,
          });
          continue;
        }

        // Create profile for the user
        if (userData?.user) {
          await supabaseAdmin.from('profiles').upsert({
            user_id: userData.user.id,
            company_name: testUser.isAdmin ? 'AYN Admin' : 'Test Company',
            contact_person: testUser.fullName,
          }, { onConflict: 'user_id' });

          // Create access grant for the user
          await supabaseAdmin.from('access_grants').upsert({
            user_id: userData.user.id,
            is_active: true,
            monthly_limit: testUser.isAdmin ? 10000 : 1000,
            requires_approval: false,
          }, { onConflict: 'user_id' });

          // If admin, add admin role
          if (testUser.isAdmin) {
            await supabaseAdmin.from('user_roles').upsert({
              user_id: userData.user.id,
              role: 'admin',
            }, { onConflict: 'user_id,role' });
          }
        }

        results.push({
          email: testUser.email,
          status: 'created',
          message: `User created successfully${testUser.isAdmin ? ' with admin role' : ''}`,
        });
      } catch (userError) {
        results.push({
          email: testUser.email,
          status: 'error',
          message: userError instanceof Error ? userError.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          created: results.filter(r => r.status === 'created').length,
          existing: results.filter(r => r.status === 'exists').length,
          errors: results.filter(r => r.status === 'error').length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Setup test users error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
