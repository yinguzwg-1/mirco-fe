/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // 配置基础路径（通过 /micro-fe 代理访问时需要）
  basePath: '/micro-fe',
  assetPrefix: '/micro-fe',
  
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
