FROM nginx:alpine

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/

# Copy static website files
COPY index.html styles.css app.js student-management-system.zip /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
