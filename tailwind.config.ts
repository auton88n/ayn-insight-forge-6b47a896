import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
    	container: {
    		center: true,
    		padding: '2rem',
    		screens: {
    			'2xl': '1400px'
    		}
    	},
    	extend: {
		fontFamily: {
			sans: [
				'Inter',
				'-apple-system',
				'BlinkMacSystemFont',
				'system-ui',
				'sans-serif'
			],
			serif: [
				'Syne',
				'system-ui',
				'sans-serif'
			],
			display: [
				'Syne',
				'system-ui',
				'sans-serif'
			],
			mono: [
				'JetBrains Mono',
				'ui-monospace',
				'SFMono-Regular',
				'Consolas',
				'monospace'
			]
		},
    		colors: {
    			border: 'hsl(var(--border))',
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			ayn: {
    				DEFAULT: 'hsl(var(--ayn-orange))',
    				hover: 'hsl(var(--ayn-orange-hover))'
    			},
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			warning: {
    				DEFAULT: 'hsl(var(--warning))',
    				foreground: 'hsl(var(--warning-foreground))'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			sidebar: {
    				DEFAULT: 'hsl(var(--sidebar-background))',
    				foreground: 'hsl(var(--sidebar-foreground))',
    				primary: 'hsl(var(--sidebar-primary))',
    				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
    				accent: 'hsl(var(--sidebar-accent))',
    				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
    				border: 'hsl(var(--sidebar-border))',
    				ring: 'hsl(var(--sidebar-ring))'
    			}
    		},
    		backgroundImage: {
    			'gradient-primary': 'var(--gradient-primary)',
    			'gradient-secondary': 'var(--gradient-secondary)',
    			'gradient-accent': 'var(--gradient-accent)',
    			'gradient-hero': 'var(--gradient-hero)',
    			'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))'
    		},
    		boxShadow: {
    			'neon-purple': 'var(--neon-purple)',
    			'neon-blue': 'var(--neon-blue)',
    			'neon-teal': 'var(--neon-teal)',
    			glass: 'var(--glass-shadow)'
    		},
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		},
    		keyframes: {
    			'accordion-down': {
    				from: {
    					height: '0'
    				},
    				to: {
    					height: 'var(--radix-accordion-content-height)'
    				}
    			},
    			'accordion-up': {
    				from: {
    					height: 'var(--radix-accordion-content-height)'
    				},
    				to: {
    					height: '0'
    				}
    			},
    			'gradient-shift': {
    				'0%': {
    					backgroundPosition: '0% 50%'
    				},
    				'50%': {
    					backgroundPosition: '100% 50%'
    				},
    				'100%': {
    					backgroundPosition: '0% 50%'
    				}
    			},
    			'fade-in-up': {
    				'0%': {
    					opacity: '0',
    					transform: 'translateY(20px)'
    				},
    				'100%': {
    					opacity: '1',
    					transform: 'translateY(0)'
    				}
    			},
    			'pulse-glow': {
    				'0%, 100%': {
    					boxShadow: '0 0 5px hsl(0 0% 70%)'
    				},
    				'50%': {
    					boxShadow: '0 0 20px hsl(0 0% 80%), 0 0 30px hsl(0 0% 90%)'
    				}
    			},
    			float: {
    				'0%, 100%': {
    					transform: 'translateY(0px)'
    				},
    				'50%': {
    					transform: 'translateY(-10px)'
    				}
    			},
    			typewriter: {
    				'0%': {
    					width: '0ch'
    				},
    				'100%': {
    					width: '100%'
    				}
    			},
    			blink: {
    				'0%, 50%': {
    					borderColor: 'transparent'
    				},
    				'51%, 100%': {
    					borderColor: 'currentColor'
    				}
    			},
    			'placeholder-pulse': {
    				'0%, 100%': {
    					opacity: '0.7'
    				},
    				'50%': {
    					opacity: '0.4'
    				}
    			},
    			'scale-fade-in': {
    				'0%': { opacity: '0', transform: 'scale(0.95)' },
    				'100%': { opacity: '1', transform: 'scale(1)' }
    			},
    			'scale-fade-out': {
    				'0%': { opacity: '1', transform: 'scale(1)' },
    				'100%': { opacity: '0', transform: 'scale(0.95)' }
    			},
    			'slide-up-fade': {
    				'0%': { opacity: '0', transform: 'translateY(8px)' },
    				'100%': { opacity: '1', transform: 'translateY(0)' }
    			},
    			'slide-down-fade': {
    				'0%': { opacity: '0', transform: 'translateY(-8px)' },
    				'100%': { opacity: '1', transform: 'translateY(0)' }
    			},
    			'list-item-enter': {
    				'0%': { opacity: '0', transform: 'translateX(-10px)' },
    				'100%': { opacity: '1', transform: 'translateX(0)' }
    			},
    			'button-press': {
    				'0%': { transform: 'scale(1)' },
    				'50%': { transform: 'scale(0.97)' },
    				'100%': { transform: 'scale(1)' }
    			},
    			'soft-pulse': {
    				'0%, 100%': { opacity: '1' },
    				'50%': { opacity: '0.8' }
    			},
    			'bounce-dot': {
    				'0%, 100%': { transform: 'translateY(0)' },
    				'50%': { transform: 'translateY(-4px)' }
    			},
    			shimmer: {
    				'0%': { backgroundPosition: '-200% 0' },
    				'100%': { backgroundPosition: '200% 0' }
    			},
    			'scroll-fade-up': {
    				'0%': { opacity: '0', transform: 'translateY(40px)' },
    				'100%': { opacity: '1', transform: 'translateY(0)' }
    			},
    			'scroll-fade-left': {
    				'0%': { opacity: '0', transform: 'translateX(-40px)' },
    				'100%': { opacity: '1', transform: 'translateX(0)' }
    			},
    			'scroll-fade-right': {
    				'0%': { opacity: '0', transform: 'translateX(40px)' },
    				'100%': { opacity: '1', transform: 'translateX(0)' }
    			},
    			'scroll-scale-in': {
    				'0%': { opacity: '0', transform: 'scale(0.9)' },
    				'100%': { opacity: '1', transform: 'scale(1)' }
    			},
			'scroll-rotate-in': {
				'0%': { opacity: '0', transform: 'rotate(-5deg) scale(0.95)' },
				'100%': { opacity: '1', transform: 'rotate(0) scale(1)' }
			},
			'eye-breathe': {
				'0%, 100%': { transform: 'scale(1)' },
				'50%': { transform: 'scale(1.03)' }
			},
			'float-slow': {
				'0%, 100%': { transform: 'translateY(0)', opacity: '0.3' },
				'50%': { transform: 'translateY(-12px)', opacity: '0.5' }
			}
    		},
		animation: {
			'accordion-down': 'accordion-down 0.2s ease-out',
			'accordion-up': 'accordion-up 0.2s ease-out',
			'gradient-shift': 'gradient-shift 15s ease infinite',
			'fade-in-up': 'fade-in-up 0.6s ease-out',
			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
			float: 'float 3s ease-in-out infinite',
			typewriter: 'typewriter 3s steps(30, end) infinite',
			blink: 'blink 1s step-end infinite',
			'placeholder-pulse': 'placeholder-pulse 2s ease-in-out infinite',
			'scale-fade-in': 'scale-fade-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
			'scale-fade-out': 'scale-fade-out 0.15s ease-out',
			'slide-up-fade': 'slide-up-fade 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
			'slide-down-fade': 'slide-down-fade 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
			'list-item-enter': 'list-item-enter 0.3s ease-out',
			'button-press': 'button-press 0.15s ease-out',
			'soft-pulse': 'soft-pulse 2s ease-in-out infinite',
			'bounce-dot': 'bounce-dot 1.4s ease-in-out infinite',
			shimmer: 'shimmer 2s linear infinite',
			'scroll-fade-up': 'scroll-fade-up 0.8s cubic-bezier(0.32, 0.72, 0, 1)',
			'scroll-fade-left': 'scroll-fade-left 0.8s cubic-bezier(0.32, 0.72, 0, 1)',
			'scroll-fade-right': 'scroll-fade-right 0.8s cubic-bezier(0.32, 0.72, 0, 1)',
			'scroll-scale-in': 'scroll-scale-in 0.8s cubic-bezier(0.32, 0.72, 0, 1)',
			'scroll-rotate-in': 'scroll-rotate-in 0.8s cubic-bezier(0.32, 0.72, 0, 1)',
			'spin-slow': 'spin 3s linear infinite',
			'eye-breathe': 'eye-breathe 2s ease-in-out infinite'
		}
    	}
    },
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
