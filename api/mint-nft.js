<?php

/**
 * Plugin Name: Solana NFT Maker
 * Description: A plugin to generate and display Solana NFTs.
 * Version: 1.0.0
 * Author: Your Name
 */

// Exit if accessed directly.
if (!defined('ABSPATH')) {
    exit;
}

// Only include files that actually exist
$plugin_dir = plugin_dir_path(__FILE__);

// Core includes that we know exist
if (file_exists($plugin_dir . 'includes/enhanced-nft-product-fields.php')) {
    require_once $plugin_dir . 'includes/enhanced-nft-product-fields.php';
}

if (file_exists($plugin_dir . 'includes/enhanced-nft-minting.php')) {
    require_once $plugin_dir . 'includes/enhanced-nft-minting.php';
}

if (file_exists($plugin_dir . 'includes/webhook-handler.php')) {
    require_once $plugin_dir . 'includes/webhook-handler.php';
}

if (file_exists($plugin_dir . 'includes/admin-settings.php')) {
    require_once $plugin_dir . 'includes/admin-settings.php';
}

if (file_exists($plugin_dir . 'includes/nft-debug-tools.php')) {
    require_once $plugin_dir . 'includes/nft-debug-tools.php';
}

if (file_exists($plugin_dir . 'includes/nft-shortcodes.php')) {
    require_once $plugin_dir . 'includes/nft-shortcodes.php';
}

if (file_exists($plugin_dir . 'includes/category-page-enhancements.php')) {
    require_once $plugin_dir . 'includes/category-page-enhancements.php';
}

/**
 * Plugin activation hook.
 */
function solana_nft_maker_activate() {
    // Actions to perform upon plugin activation.
}
register_activation_hook(__FILE__, 'solana_nft_maker_activate');

/**
 * Plugin deactivation hook.
 */
function solana_nft_maker_deactivate() {
    // Actions to perform upon plugin deactivation.
}
register_deactivation_hook(__FILE__, 'solana_nft_maker_deactivate');

class SolanaNFTMaker {

    private static $instance;

    public static function get_instance() {
        if (!isset(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('wp_ajax_solana_nft_mint', array($this, 'handle_nft_minting'));
        add_action('wp_ajax_nopriv_solana_nft_mint', array($this, 'handle_nft_minting')); // For non-logged-in users
        add_action('woocommerce_product_options_general_product_data', array($this, 'add_nft_fields_to_product'));
        add_action('woocommerce_process_product_meta', array($this, 'save_nft_fields'));
        add_action('woocommerce_single_product_summary', 'display_nft_wallet_section', 25);
    }

    public function add_admin_menu() {
        add_menu_page(
            'Solana NFT Maker',
            'Solana NFT Maker',
            'manage_options',
            'solana-nft-maker',
            array($this, 'admin_page_contents'),
            'dashicons-tickets-alt'
        );
    }

    public function admin_page_contents() {
        ?>
        <div class="wrap">
            <h1>Solana NFT Maker Settings</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('solana_nft_settings');
                do_settings_sections('solana-nft-maker');
                submit_button();
                ?>
            </form>
        </div>
        <?php
    }

    public function register_settings() {
        register_setting('solana_nft_settings', 'solana_bridge_url');

        add_settings_section(
            'solana_nft_settings_section',
            'General Settings',
            array($this, 'settings_section_callback'),
            'solana-nft-maker'
        );

        add_settings_field(
            'solana_bridge_url',
            'Solana Bridge URL',
            array($this, 'bridge_url_field_callback'),
            'solana-nft-maker',
            'solana_nft_settings_section'
        );
    }

    public function settings_section_callback() {
        echo 'Configure the Solana NFT Maker plugin.';
    }

    public function bridge_url_field_callback() {
        $bridge_url = get_option('solana_bridge_url');
        echo "<input type='text' name='solana_bridge_url' value='" . esc_attr($bridge_url) . "' size='50' />";
    }

    public function enqueue_scripts() {
        // Only enqueue if on single product page or if we have gated content
        global $post;
        if (!is_product() && (!$post || (!has_shortcode($post->post_content, 'nft_gated_content') && !has_shortcode($post->post_content, 'nft_exclusive_layout')))) {
            return;
        }
        
        // Add Buffer polyfill inline to fix the buffer error
        wp_add_inline_script('jquery', '
            if (typeof window.Buffer === "undefined") {
                window.Buffer = {
                    from: function(data) { return new Uint8Array(data); },
                    alloc: function(size) { return new Uint8Array(size); }
                };
            }
            if (typeof window.require === "undefined") {
                window.require = function(module) {
                    if (module === "buffer") return { Buffer: window.Buffer };
                    return {};
                };
            }
        ', 'before');
        
        // Enqueue Solana Web3.js with proper error handling
        wp_enqueue_script('solana-web3', 'https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js', array('jquery'), null, true);
        
        // Enqueue our main script
        wp_enqueue_script('solana-nft-script', plugin_dir_url(__FILE__) . 'assets/js/solana-nft-maker.js', array('jquery', 'solana-web3'), '1.0.0', true);
        
        // Enqueue styles - ONLY IF FILES EXIST
        $css_file = plugin_dir_path(__FILE__) . 'assets/css/solana-nft-maker.css';
        if (file_exists($css_file)) {
            wp_enqueue_style('solana-nft-maker-style', plugin_dir_url(__FILE__) . 'assets/css/solana-nft-maker.css', array(), '1.0.0');
        }

        // Localize script with AJAX data - FIXED
        wp_localize_script('solana-nft-script', 'solana_nft_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('solana_nft_ajax'),
            'network' => get_option('solana_network', 'devnet'),
            'rpc_endpoint' => get_option('solana_rpc_endpoint', 'https://api.devnet.solana.com'),
            'merchant_wallet' => get_option('solana_merchant_wallet', ''),
            'plugin_url' => plugin_dir_url(__FILE__)
        ));
    }

    public function add_nft_fields_to_product() {
        global $woocommerce, $post;

        echo '<div class="options_group">';

        woocommerce_wp_text_input(
            array(
                'id' => '_nft_name',
                'label' => __('NFT Name', 'woocommerce'),
                'placeholder' => __('NFT Name', 'woocommerce'),
                'desc_tip' => 'true',
                'description' => __('Enter the name of the NFT.', 'woocommerce')
            )
        );

        woocommerce_wp_textarea_input(
            array(
                'id' => '_nft_description',
                'label' => __('NFT Description', 'woocommerce'),
                'placeholder' => __('NFT Description', 'woocommerce'),
                'desc_tip' => 'true',
                'description' => __('Enter the description of the NFT.', 'woocommerce')
            )
        );

        woocommerce_wp_text_input(
            array(
                'id' => '_nft_image_url',
                'label' => __('NFT Image URL', 'woocommerce'),
                'placeholder' => __('NFT Image URL', 'woocommerce'),
                'desc_tip' => 'true',
                'description' => __('Enter the URL of the NFT image.', 'woocommerce')
            )
        );

        echo '</div>';
    }

    public function save_nft_fields($post_id) {
        // Save basic NFT fields
        $nft_name = sanitize_text_field($_POST['_nft_name'] ?? '');
        $nft_description = sanitize_textarea_field($_POST['_nft_description'] ?? '');
        $nft_image_url = esc_url_raw($_POST['_nft_image_url'] ?? '');

        update_post_meta($post_id, '_nft_name', $nft_name);
        update_post_meta($post_id, '_nft_description', $nft_description);
        update_post_meta($post_id, '_nft_image_url', $nft_image_url);
        
        // Mark as NFT product if any NFT fields are filled
        if (!empty($nft_name) || !empty($nft_description) || !empty($nft_image_url)) {
            update_post_meta($post_id, '_is_nft_product', 'yes');
        } else {
            update_post_meta($post_id, '_is_nft_product', 'no');
        }
    }

    public function handle_nft_minting() {
        // Verify nonce
        if (!wp_verify_nonce($_POST['nonce'], 'solana_nft_ajax_nonce')) {
            wp_send_json_error('Security check failed');
            return;
        }
        
        $wallet_address = sanitize_text_field($_POST['wallet_address']);
        $transaction_signature = sanitize_text_field($_POST['transaction_signature']);
        $product_id = intval($_POST['product_id']);
        
        error_log("🎨 NFT Minting Request: Wallet={$wallet_address}, Product={$product_id}, Tx={$transaction_signature}");
        
        if (empty($wallet_address) || empty($product_id)) {
            error_log("❌ Missing required parameters for NFT minting");
            wp_send_json_error('Missing required parameters');
            return;
        }
        
        // Check if this NFT is already minted
        $existing_owner = get_post_meta($product_id, '_nft_owner_wallet', true);
        if (!empty($existing_owner)) {
            error_log("❌ NFT already minted to: {$existing_owner}");
            wp_send_json_error('This NFT has already been minted');
            return;
        }
        
        // Process crypto payment NFT minting
        if (class_exists('SolanaNFTMinting')) {
            $result = SolanaNFTMinting::process_crypto_payment_nft($wallet_address, $transaction_signature, $product_id);
        } else {
            // Fallback minting process
            $result = $this->fallback_mint_nft($wallet_address, $transaction_signature, $product_id);
        }
        
        error_log("🎨 NFT Minting Result: " . print_r($result, true));
        
        if ($result['success']) {
            wp_send_json_success($result);
        } else {
            wp_send_json_error($result['error'] ?? 'Unknown minting error');
        }
    }

    private function fallback_mint_nft($wallet_address, $transaction_signature, $product_id) {
        error_log("🔄 Using fallback NFT minting process");

        try {
            $product = wc_get_product($product_id);
            if (!$product) {
                return array('success' => false, 'error' => 'Product not found');
            }

            // Get NFT metadata
            $nft_name = get_post_meta($product_id, '_nft_name', true) ?: $product->get_name();
            $nft_description = get_post_meta($product_id, '_nft_description', true) ?: $product->get_short_description();
            $nft_image = get_post_meta($product_id, '_nft_image_url', true);

            if (empty($nft_image)) {
                $image_id = $product->get_image_id();
                if ($image_id) {
                    $nft_image = wp_get_attachment_url($image_id);
                }
            }

            // Try bridge server first
            $bridge_result = $this->try_bridge_minting($wallet_address, $product_id, $nft_name, $nft_description, $nft_image);

            if ($bridge_result['success']) {
                // Update product metadata
                update_post_meta($product_id, '_nft_owner_wallet', $wallet_address);
                update_post_meta($product_id, '_nft_minted', 'yes');
                update_post_meta($product_id, '_nft_transaction_signature', $transaction_signature);

                if (isset($bridge_result['mint_address'])) {
                    update_post_meta($product_id, '_nft_mint_address', $bridge_result['mint_address']);
                }

                // Update stock status
                $product->set_stock_status('outofstock');
                $product->set_stock_quantity(0);
                $product->save();

                error_log("✅ NFT minted successfully via bridge server");

                return array(
                    'success' => true,
                    'message' => 'NFT minted successfully!',
                    'mint_address' => $bridge_result['mint_address'] ?? 'pending',
                    'transaction_signature' => $transaction_signature
                );
            } else {
                error_log("❌ Bridge minting failed: " . ($bridge_result['error'] ?? 'Unknown error'));
                return array('success' => false, 'error' => $bridge_result['error'] ?? 'Bridge minting failed');
            }
        } catch (Exception $e) {
            error_log("❌ Fallback minting error: " . $e->getMessage());
            return array('success' => false, 'error' => $e->getMessage());
        }
    }

    private function try_bridge_minting($wallet_address, $product_id, $name, $description, $image_url) {
        $bridge_url = get_option('solana_bridge_url', '');
        
        if (empty($bridge_url)) {
            return array('success' => false, 'error' => 'Bridge server not configured');
        }
        
        $product = wc_get_product($product_id);
        
        $metadata = array(
            'name' => $name,
            'description' => $description,
            'image' => $image_url,
            'attributes' => array(
                array('trait_type' => 'Product ID', 'value' => $product_id),
                array('trait_type' => 'Product Name', 'value' => $product->get_name()),
                array('trait_type' => 'Minted Date', 'value' => date('Y-m-d H:i:s'))
            )
        );
        
        $data = array(
            'walletAddress' => $wallet_address,
            'metadata' => $metadata
        );
        
        $response = wp_remote_post($bridge_url . '/mint-nft', array(
            'timeout' => 60,
            'headers' => array(
                'Content-Type' => 'application/json'
            ),
            'body' => json_encode($data)
        ));
        
        if (is_wp_error($response)) {
            error_log("❌ Bridge server request failed: " . $response->get_error_message());
            return array('success' => false, 'error' => $response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($status_code !== 200) {
            error_log("❌ Bridge server HTTP error: {$status_code} - {$body}");
            return array('success' => false, 'error' => "Bridge server error: {$status_code}");
        }
        
        $result = json_decode($body, true);
        
        if (!$result || !isset($result['success'])) {
            error_log("❌ Invalid bridge server response: {$body}");
            return array('success' => false, 'error' => 'Invalid bridge server response');
        }
        
        return $result;
    }
}

// Initialize the plugin
SolanaNFTMaker::get_instance();

/**
 * Additional NFT field saving for enhanced NFT fields
 */
add_action('woocommerce_process_product_meta', 'save_additional_nft_fields');

function save_additional_nft_fields($post_id) {
    // Save Enable NFT checkbox  
    $enable_nft = isset($_POST['enable_nft']) ? 'yes' : 'no';
    update_post_meta($post_id, '_enable_nft', $enable_nft);
    
    // Save additional NFT fields that might come from enhanced forms
    if (isset($_POST['nft_name'])) {
        update_post_meta($post_id, '_nft_name', sanitize_text_field($_POST['nft_name']));
    }
    
    if (isset($_POST['nft_description'])) {
        update_post_meta($post_id, '_nft_description', sanitize_textarea_field($_POST['nft_description']));
    }
    
    if (isset($_POST['nft_image'])) {
        update_post_meta($post_id, '_nft_image', esc_url_raw($_POST['nft_image']));
        // Also save as _nft_image_url for compatibility
        update_post_meta($post_id, '_nft_image_url', esc_url_raw($_POST['nft_image']));
    }
    
    if (isset($_POST['nft_type'])) {
        update_post_meta($post_id, '_nft_type', sanitize_text_field($_POST['nft_type']));
    }
    
    if (isset($_POST['max_supply'])) {
        update_post_meta($post_id, '_max_supply', intval($_POST['max_supply']));
    }
    
    if (isset($_POST['royalty_percentage'])) {
        update_post_meta($post_id, '_royalty_percentage', floatval($_POST['royalty_percentage']));
    }
    
    if (isset($_POST['solana_collection_address'])) {
        update_post_meta($post_id, '_solana_collection_address', sanitize_text_field($_POST['solana_collection_address']));
    }
    
    if (isset($_POST['gated_access'])) {
        update_post_meta($post_id, '_gated_access', 'yes');
    } else {
        update_post_meta($post_id, '_gated_access', 'no');
    }
    
    // Mark as NFT product if any NFT fields are filled
    if (!empty($_POST['nft_name']) || !empty($_POST['enable_nft']) || !empty($_POST['_nft_name'])) {
        update_post_meta($post_id, '_is_nft_product', 'yes');
    }
}

/**
 * Enqueue scripts and styles.
 */
function solana_nft_maker_enqueue_scripts() {
    // Only enqueue if on single product page or if we have gated content
    global $post;
    if (!is_product() && (!$post || (!has_shortcode($post->post_content, 'nft_gated_content') && !has_shortcode($post->post_content, 'nft_exclusive_layout')))) {
        return;
    }
    
    // Add Buffer polyfill inline to fix the buffer error
    wp_add_inline_script('jquery', '
        if (typeof window.Buffer === "undefined") {
            window.Buffer = {
                from: function(data) { return new Uint8Array(data); },
                alloc: function(size) { return new Uint8Array(size); }
            };
        }
        if (typeof window.require === "undefined") {
            window.require = function(module) {
                if (module === "buffer") return { Buffer: window.Buffer };
                return {};
            };
        }
    ', 'before');
    
    // Enqueue Solana Web3.js with proper error handling
    wp_enqueue_script('solana-web3', 'https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js', array('jquery'), null, true);
    
    // Enqueue our main script
    wp_enqueue_script('solana-nft-maker-script', plugin_dir_url(__FILE__) . 'assets/js/solana-nft-maker.js', array('jquery', 'solana-web3'), '1.0.0', true);
    
    // Enqueue styles - ONLY IF FILES EXIST
    $css_file = plugin_dir_path(__FILE__) . 'assets/css/solana-nft-maker.css';
    if (file_exists($css_file)) {
        wp_enqueue_style('solana-nft-maker-style', plugin_dir_url(__FILE__) . 'assets/css/solana-nft-maker.css', array(), '1.0.0');
    }

    // Localize script with AJAX data - FIXED
    wp_localize_script('solana-nft-maker-script', 'solana_nft_ajax', array(
        'ajax_url' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('solana_nft_ajax'),
        'network' => get_option('solana_network', 'devnet'),
        'rpc_endpoint' => get_option('solana_rpc_endpoint', 'https://api.devnet.solana.com'),
        'merchant_wallet' => get_option('solana_merchant_wallet', ''),
        'plugin_url' => plugin_dir_url(__FILE__)
    ));
}
add_action('wp_enqueue_scripts', 'solana_nft_maker_enqueue_scripts');

// FORCE BRIDGE SERVER MINTING - NO DEMO MODE
add_action('wp_ajax_mint_nft', 'handle_mint_nft_ajax_force_bridge');
add_action('wp_ajax_nopriv_mint_nft', 'handle_mint_nft_ajax_force_bridge');

function handle_mint_nft_ajax_force_bridge() {
    // Verify nonce
    if (!wp_verify_nonce($_POST['nonce'], 'solana_nft_ajax')) {
        error_log("❌ NFT Minting: Nonce verification failed");
        wp_send_json_error('Security check failed');
        return;
    }
    
    $wallet_address = sanitize_text_field($_POST['wallet_address']);
    $transaction_signature = sanitize_text_field($_POST['transaction_signature']);
    $product_id = intval($_POST['product_id']);
    
    error_log("🎨 FORCE BRIDGE NFT Minting Request: Wallet={$wallet_address}, Product={$product_id}, Tx={$transaction_signature}");
    
    if (empty($wallet_address) || empty($product_id)) {
        error_log("❌ Missing required parameters for NFT minting");
        wp_send_json_error('Missing required parameters');
        return;
    }
    
    // Check if this NFT is already minted
    $existing_owner = get_post_meta($product_id, '_nft_owner_wallet', true);
    if (!empty($existing_owner)) {
        error_log("❌ NFT already minted to: {$existing_owner}");
        wp_send_json_error('This NFT has already been minted');
        return;
    }
    
    // FORCE BRIDGE SERVER USAGE - NO FALLBACK TO DEMO
    $result = force_bridge_mint_nft_real($wallet_address, $transaction_signature, $product_id);
    
    error_log("🎨 FORCE BRIDGE NFT Minting Result: " . print_r($result, true));
    
    if ($result['success']) {
        wp_send_json_success($result);
    } else {
        wp_send_json_error($result['error'] ?? 'Bridge server minting failed');
    }
}

function force_bridge_mint_nft_real($wallet_address, $transaction_signature, $product_id) {
    error_log("🚀 FORCING REAL BRIDGE SERVER NFT MINTING - NO DEMO MODE");
    
    try {
        $product = wc_get_product($product_id);
        if (!$product) {
            return array('success' => false, 'error' => 'Product not found');
        }
        
        // Get NFT metadata
        $nft_name = get_post_meta($product_id, '_nft_name', true) ?: $product->get_name();
        $nft_description = get_post_meta($product_id, '_nft_description', true) ?: $product->get_short_description();
        $nft_image = get_post_meta($product_id, '_nft_image_url', true);
        
        if (empty($nft_image)) {
            $image_id = $product->get_image_id();
            if ($image_id) {
                $nft_image = wp_get_attachment_url($image_id);
            }
        }
        
        // FORCE BRIDGE SERVER URL - HARDCODED TO ENSURE IT WORKS
        $bridge_url = 'https://sol-server-bridge-mainnet.vercel.app';
        
        error_log("🌉 FORCING bridge server call: " . $bridge_url . '/mint-nft');
        
        $metadata = array(
            'name' => $nft_name,
            'description' => $nft_description,
            'image' => $nft_image,
            'attributes' => array(
                array('trait_type' => 'Product ID', 'value' => $product_id),
                array('trait_type' => 'Product Name', 'value' => $product->get_name()),
                array('trait_type' => 'Minted Date', 'value' => date('Y-m-d H:i:s'))
            )
        );
        
        $data = array(
            'walletAddress' => $wallet_address,
            'metadata' => $metadata
        );
        
        error_log("📋 FORCE BRIDGE Metadata: " . print_r($metadata, true));
        
        // FORCE BRIDGE SERVER CALL WITH EXTENDED TIMEOUT
        $response = wp_remote_post($bridge_url . '/mint-nft', array(
            'timeout' => 120, // Extended timeout
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress-Solana-NFT-Maker/1.0'
            ),
            'body' => json_encode($data)
        ));
        
        if (is_wp_error($response)) {
            error_log("❌ FORCE BRIDGE server request failed: " . $response->get_error_message());
            return array('success' => false, 'error' => 'Bridge server unreachable: ' . $response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        error_log("🌉 FORCE BRIDGE server response: Status={$status_code}, Body=" . substr($body, 0, 500));
        
        if ($status_code !== 200) {
            error_log("❌ FORCE BRIDGE server HTTP error: {$status_code} - {$body}");
            return array('success' => false, 'error' => "Bridge server error: {$status_code} - " . substr($body, 0, 100));
        }
        
        $result = json_decode($body, true);
        
        if (!$result || !isset($result['success'])) {
            error_log("❌ Invalid FORCE BRIDGE server response: {$body}");
            return array('success' => false, 'error' => 'Invalid bridge server response: ' . substr($body, 0, 100));
        }
        
        if ($result['success']) {
            // Update product metadata with REAL mint address
            $mint_address = $result['mint_address'] ?? $result['mintAddress'] ?? 'unknown';
            
            // ENSURE NO DEMO ADDRESSES
            if (strpos($mint_address, 'DEMO') !== false) {
                error_log("❌ Bridge server returned DEMO address: {$mint_address}");
                return array('success' => false, 'error' => 'Bridge server returned demo address instead of real NFT');
            }
            
            update_post_meta($product_id, '_nft_owner_wallet', $wallet_address);
            update_post_meta($product_id, '_nft_minted', 'yes');
            update_post_meta($product_id, '_nft_transaction_signature', $transaction_signature);
            update_post_meta($product_id, '_nft_mint_address', $mint_address);
            update_post_meta($product_id, '_nft_mint_date', current_time('mysql'));
            
            // Update stock status
            $product->set_stock_status('outofstock');
            $product->set_stock_quantity(0);
            $product->save();
            
            error_log("✅ REAL NFT minted successfully via FORCE BRIDGE server! Mint: {$mint_address}");
            
            return array(
                'success' => true,
                'message' => 'REAL NFT minted successfully on Solana blockchain!',
                'mint_address' => $mint_address,
                'transaction_signature' => $transaction_signature,
                'method' => 'force_bridge_server_real'
            );
        } else {
            error_log("❌ FORCE BRIDGE server returned error: " . ($result['error'] ?? 'Unknown error'));
            return array('success' => false, 'error' => $result['error'] ?? 'Bridge server minting failed');
        }
        
    } catch (Exception $e) {
        error_log("❌ FORCE BRIDGE minting error: " . $e->getMessage());
       return array('success' => false, 'error' => 'Bridge server error: ' . $e->getMessage());
   }
}

// Simple function to display NFT section on product pages
function display_nft_wallet_section() {
   global $product;
   
   if (!$product) {
       return;
   }
   
   // Check if this is an NFT product
   $is_nft = get_post_meta($product->get_id(), '_is_nft_product', true) === 'yes';
   
   if (!$is_nft) {
       return;
   }
   
   ?>
   <div class="nft-wallet-section" style="background: #f0f8ff; padding: 20px; margin: 20px 0; border: 2px solid #0073aa; border-radius: 8px;">
       <h3>🔗 Connect Your Solana Wallet</h3>
       
       <!-- Hidden fields for JavaScript -->
       <input type="hidden" id="product-id" value="<?php echo esc_attr($product->get_id()); ?>" />
       <input type="hidden" id="product-price" value="<?php echo esc_attr($product->get_price()); ?>" />
       
       <!-- Wallet Connection Button -->
       <button id="wallet-connect-button" class="button" style="background: #0073aa; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 0;">
           Connect Wallet
       </button>
       
       <!-- Payment Section (hidden by default) -->
       <div id="payment-section" style="display: none; margin-top: 20px;">
           <div class="sol-price-display" style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
               <p style="font-size: 18px; margin: 0;"><strong>Price:</strong> <span id="sol-price">Calculating...</span> SOL</p>
               <p style="font-size: 14px; color: #666; margin: 5px 0 0 0;">≈ $<?php echo esc_html($product->get_price()); ?> USD</p>
           </div>
           
           <button id="pay-with-sol" class="button button-primary" style="background: #28a745; color: white; padding: 12px 24px; font-size: 16px; border: none; border-radius: 5px; cursor: pointer; width: 100%;">
               💎 Pay with SOL & Mint NFT
           </button>
       </div>
   </div>
   <?php
}

// Add the wallet section to product pages
add_action('woocommerce_single_product_summary', 'display_nft_wallet_section', 25);

// Additional AJAX handlers for NFT operations
add_action('wp_ajax_check_nft_ownership', 'handle_check_nft_ownership');
add_action('wp_ajax_nopriv_check_nft_ownership', 'handle_check_nft_ownership');

function handle_check_nft_ownership() {
   // Verify nonce
   if (!wp_verify_nonce($_POST['nonce'], 'solana_nft_ajax')) {
       wp_send_json_error('Security check failed');
       return;
   }
   
   $wallet_address = sanitize_text_field($_POST['wallet_address']);
   $product_id = intval($_POST['product_id']);
   
   if (empty($wallet_address) || empty($product_id)) {
       wp_send_json_error('Missing required parameters');
       return;
   }
   
   // Check NFT ownership
   $owner_wallet = get_post_meta($product_id, '_nft_owner_wallet', true);
   $mint_address = get_post_meta($product_id, '_nft_mint_address', true);
   $mint_date = get_post_meta($product_id, '_nft_mint_date', true);
   
   $response_data = array(
       'owner_wallet' => $owner_wallet,
       'mint_address' => $mint_address,
       'mint_date' => $mint_date,
       'is_owner' => (strtolower($wallet_address) === strtolower($owner_wallet)),
       'is_minted' => !empty($owner_wallet)
   );
   
   wp_send_json_success($response_data);
}

// Additional AJAX handler for NFT status checks
add_action('wp_ajax_check_nft_status', 'handle_check_nft_status');
add_action('wp_ajax_nopriv_check_nft_status', 'handle_check_nft_status');

function handle_check_nft_status() {
   // Verify nonce
   if (!wp_verify_nonce($_POST['nonce'], 'solana_nft_ajax')) {
       wp_send_json_error('Security check failed');
       return;
   }
   
   $product_id = intval($_POST['product_id']);
   
   if (empty($product_id)) {
       wp_send_json_error('Missing product ID');
       return;
   }
   
   $is_minted = get_post_meta($product_id, '_nft_minted', true) === 'yes';
   $owner_wallet = get_post_meta($product_id, '_nft_owner_wallet', true);
   $mint_address = get_post_meta($product_id, '_nft_mint_address', true);
   
   wp_send_json_success(array(
       'is_minted' => $is_minted,
       'owner_wallet' => $owner_wallet,
       'mint_address' => $mint_address
   ));
}
?>
