// Using native fetch (Node.js 18+)

const testSignup = async () => {
  try {
    console.log('Testing signup endpoint...');
    
    const response = await fetch('http://localhost:3001/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'test123',
        name: 'Test Business',
        first_name: 'Test',
        last_name: 'User'
      }),
    });
    
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Signup successful!');
    } else {
      console.log('❌ Signup failed:', data.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
};

testSignup();

