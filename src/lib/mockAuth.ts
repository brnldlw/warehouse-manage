// Simple mock authentication for testing
export const mockUsers = [
  {
    id: 'admin-1',
    email: 'admin@test.com',
    password: 'admin123',
    role: 'admin',
    first_name: 'Admin',
    last_name: 'User'
  },
  {
    id: 'tech-1', 
    email: 'tech@test.com',
    password: 'tech123',
    role: 'tech',
    first_name: 'Tech',
    last_name: 'User'
  }
];

// Store for dynamically added users
let dynamicUsers: any[] = [];

export const addMockUser = (email: string, password: string, userData: any) => {
  const newUser = {
    id: `user-${Date.now()}`,
    email,
    password,
    role: 'tech', // Default role for new signups
    first_name: userData.first_name || '',
    last_name: userData.last_name || ''
  };
  dynamicUsers.push(newUser);
  return newUser;
};

export const mockLogin = (email: string, password: string) => {
  // Check both static and dynamic users
  const allUsers = [...mockUsers, ...dynamicUsers];
  const user = allUsers.find(u => u.email === email && u.password === password);
  if (user) {
    return {
      user: { id: user.id, email: user.email },
      profile: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    };
  }
  return null;
};