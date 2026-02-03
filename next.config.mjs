/** @type {import('next').NextConfig} */

// 生产环境通过 Nginx 代理访问，需要配置 basePath
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'standalone',
  
  // 配置基础路径（仅生产环境）
  basePath: isProd ? '/micro-fe' : '',
  assetPrefix: isProd ? '/micro-fe' : '',
  
  // 允许跨域访问（wujie 需要）
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
    ];
  },
};

export default nextConfig;
