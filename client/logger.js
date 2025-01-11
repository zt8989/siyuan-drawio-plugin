export const logger = {
  debug: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  }
};
