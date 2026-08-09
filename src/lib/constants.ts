// Values shared with the edge middleware. Kept import-free on purpose: anything this
// module pulls in ends up in the edge bundle, and the data adapters use node:fs.

export const DEV_USER_COOKIE = "ee_dev_user";
