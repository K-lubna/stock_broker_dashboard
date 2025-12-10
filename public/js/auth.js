// public/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Get references to both possible forms and the error display
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorMessage = document.getElementById('error-message');

    // Generic handler function for API response
    function handleAuthResponse(data, response) {
        if (data.success) {
            localStorage.setItem('userEmail', data.email);
            localStorage.setItem('userToken', data.token);
            window.location.href = '/index.html';
        } else {
            errorMessage.textContent = data.message || `An error occurred. Status: ${response.status}`;
        }
    }

    // --- Login Handler (If on login.html) ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMessage.textContent = ''; // Clear previous errors
            const email = document.getElementById('email').value.trim();

            if (!email) {
                errorMessage.textContent = 'Email cannot be empty.';
                return;
            }

            try {
                const response = await fetch('http://localhost:3000/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();
                handleAuthResponse(data, response);
                
                // Special check to suggest registration if user is not found (Status 404)
                if (!data.success && response.status === 404) {
                    errorMessage.innerHTML = `User not found. Please <a href="/register.html">register here</a>.`;
                }

            } catch (error) {
                errorMessage.textContent = 'Network error. Could not connect to the server.';
                console.error('Login error:', error);
            }
        });
    }

    // --- Registration Handler (If on register.html) ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMessage.textContent = ''; // Clear previous errors
            const email = document.getElementById('reg-email').value.trim();

            if (!email) {
                errorMessage.textContent = 'Email cannot be empty.';
                return;
            }
            
            try {
                // This hits the new registration endpoint
                const response = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();
                // handleAuthResponse logs the user in and redirects on success
                handleAuthResponse(data, response);

            } catch (error) {
                errorMessage.textContent = 'Network error. Could not connect to the server.';
                console.error('Registration error:', error);
            }
        });
    }
});
