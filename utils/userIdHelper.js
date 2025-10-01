// utils/userIdHelper.js - ENSURE THIS EXISTS
export const extractUserIds = (users) => {
  if (!users || !Array.isArray(users)) {
    console.warn('⚠️ extractUserIds: Invalid users array provided', users);
    return [];
  }

  return users
    .map(user => {
      if (typeof user === 'string' && user.match(/^[0-9a-fA-F]{24}$/)) {
        return user; // Valid MongoDB ObjectId string
      } else if (user && user._id) {
        return user._id.toString(); // Extract ID from user object
      } else if (user && typeof user === 'object' && user.id) {
        return user.id.toString(); // Alternative ID field
      }
      console.warn('⚠️ extractUserIds: Invalid user object', user);
      return null;
    })
    .filter(id => id !== null && id.match(/^[0-9a-fA-F]{24}$/));
};

export const isValidUserId = (userId) => {
  return userId && typeof userId === 'string' && userId.match(/^[0-9a-fA-F]{24}$/);
};