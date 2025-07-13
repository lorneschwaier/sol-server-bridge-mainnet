// Fix header text immediately
function fixHeaderText() {
  setTimeout(() => {
    if (window.$ && window.$("#solana-nft-header").length) {
      window.$("#solana-nft-header").text("NFT Mint Unlocks Hidden Content").css("text-align", "left")
    }
  }, 100)
}
// Enhanced polyfills to fix buffer and exports errors
;(() => {
  // Fix Buffer issue
  if (typeof window.Buffer === "undefined") {
    window.Buffer = {
      from: (data) => new Uint8Array(data),
      alloc: (size) => new Uint8Array(size),
    }
  }

  // Fix exports issue
  if (typeof window.exports === "undefined") {
    window.exports = {}
  }

  // Fix require issue
  if (typeof window.require === "undefined") {
    window.require = (module) => {
      if (module === "buffer") return { Buffer: window.Buffer }
      return {}
    }
  }

  // Fix global issues
  if (typeof global === "undefined") {
    window.global = window
  }
})()

/**
 * Solana NFT Maker - BRIDGE SERVER ONLY VERSION
 * NO DIRECT RPC CALLS - ALL THROUGH BRIDGE SERVER
 */
var solana_nft_ajax = window.solana_nft_ajax || {}
var solanaWeb3 = window.solanaWeb3 || {}
var jQuery = window.jQuery || {}

// PREVENT MULTIPLE INITIALIZATIONS
if (window.SolanaNFTMakerInitialized === true) {
  console.log("⚠️ Solana NFT Maker already initialized, skipping...")
} else {
  window.SolanaNFTMakerInitialized = true
  ;(($) => {
    // Ensure jQuery is available
    if (!$ || typeof $ !== "function") {
      console.error("❌ jQuery not available, cannot initialize Solana NFT Maker")
      return
    }

    let connectedWallet = null
    let walletType = null
    let isProcessingPayment = false
    let isConnectingWallet = false
    let modalShown = false
    const processedTransactions = new Set()
    let currentSOLPrice = 150
    let initializationComplete = false

    $(document).ready(() => {
      if (initializationComplete) {
        console.log("⚠️ Initialization already complete, skipping...")
        return
      }

      console.log("🚀 Solana NFT Maker initializing...")

      try {
        if (typeof window.solanaWeb3 === "undefined") {
          window.setTimeout(initializeEverything, 1000)
        } else {
          initializeEverything()
        }
      } catch (error) {
        console.error("❌ Initialization error:", error)
      }
    })

    function initializeEverything() {
      try {
        if (initializationComplete) {
          console.log("⚠️ Already initialized, skipping...")
          return
        }

        initializeWalletConnections()
        initializeStockStatus()
        moveDescriptionAndStatus()
        fixProductImageDisplay()
        hideAddToCartButton()
        calculateSOLPrice()
        checkCurrentNFTStatus()
        initializeGatedContent()
        removeDuplicateWalletElements()
        createDynamicHeaderText()

        initializationComplete = true
        console.log("✅ Solana NFT Maker initialized successfully")
      } catch (error) {
        console.error("❌ Error during initialization:", error)
      }
    }

    function createDynamicHeaderText() {
      try {
        $("#compact-sol-price").remove()
        $("#solana-nft-header").remove()

        const productId = getProductId()
        let headerText = "NFT Mint Unlocks Hidden Content"

        if (productId) {
          $.ajax({
            url: solana_nft_ajax.ajax_url,
            type: "POST",
            data: {
              action: "check_nft_ownership",
              wallet_address: "dummy",
              product_id: productId,
              nonce: solana_nft_ajax.nonce,
            },
            dataType: "json",
            success: (response) => {
              try {
                console.log("🔍 Header check response:", response)

                if (response && response.success && response.data) {
                  const ownerWallet = response.data.owner_wallet
                  const mintAddress = response.data.mint_address
                  const nftExists = ownerWallet && mintAddress && mintAddress !== "Unknown"

                  if (nftExists) {
                    headerText = "NFT Owner Unlocks Hidden Content"
                    console.log("✅ NFT exists - setting header to 'NFT Owner Unlocks Hidden Content'")
                  } else {
                    console.log("ℹ️ NFT not minted - keeping header as 'NFT Mint Unlocks Hidden Content'")
                  }
                }

                updateHeaderText(headerText)
              } catch (error) {
                console.error("❌ Error processing header response:", error)
                updateHeaderText(headerText)
              }
            },
            error: (xhr, status, error) => {
              console.log("⚠️ Header check failed:", error)
              updateHeaderText(headerText)
            },
          })
        } else {
          updateHeaderText(headerText)
        }
      } catch (error) {
        console.error("❌ Error in createDynamicHeaderText:", error)
      }
    }

    function updateHeaderText(text) {
      try {
        const headerElement = $(`
<div id="solana-nft-header" style="
  text-align: left !important;
  margin: 0 0 15px 0 !important;
  font-size: 16px !important;
  font-weight: bold !important;
  color: #333 !important;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  z-index: 999 !important;
">
  ${text}
</div>
`)

        const walletSection = $(".nft-wallet-section")
        const connectButton = $("#wallet-connect-button")
        const productSummary = $(".product .summary")

        console.log("🔍 Positioning header - found elements:", {
          walletSection: walletSection.length,
          connectButton: connectButton.length,
          productSummary: productSummary.length,
        })

        if (walletSection.length) {
          walletSection.prepend(headerElement)
          console.log("✅ Header positioned in wallet section")
        } else if (connectButton.length) {
          connectButton.before(headerElement)
          console.log("✅ Header positioned before connect button")
        } else if (productSummary.length) {
          productSummary.prepend(headerElement)
          console.log("✅ Header positioned in product summary")
        } else {
          $("body").append(headerElement)
          console.log("⚠️ Header positioned in body as fallback")
        }

        setTimeout(() => {
          $("#solana-nft-header").show().css({
            display: "block",
            visibility: "visible",
            opacity: "1",
          })
        }, 500)

        console.log("✅ Created dynamic header text:", text)
      } catch (error) {
        console.error("❌ Error in updateHeaderText:", error)
      }
    }

    function removeDuplicateWalletElements() {
      try {
        $("#wallet-connect-button:not(:first)").remove()
        $("#gated-wallet-connect").remove()
        $(".nft-wallet-section:not(:first)").remove()
        $(".nft-gated-product-message:not(:first)").remove()
        $("[id*='ownership']:not(#nft-ownership-message:first)").remove()
        $("#nft-ownership-message:not(:first)").remove()
        $("#permanent-nft-ownership-display").remove()
        $(".nft-success-message:not(:first)").remove()
        $(".always-visible-nft-info:not(:first)").remove()

        console.log("✅ Enhanced cleanup of duplicate wallet elements")
      } catch (error) {
        console.error("❌ Error in removeDuplicateWalletElements:", error)
      }
    }

    function fixProductImageDisplay() {
      try {
        $(".woocommerce-product-gallery").show()
        $(".woocommerce-product-gallery__wrapper").show()
        $(".woocommerce-product-gallery__image").show()

        $("<style>")
          .prop("type", "text/css")
          .html(`
      .single-product .woocommerce-product-gallery,
      .single-product .woocommerce-product-gallery__wrapper,
      .single-product .woocommerce-product-gallery__image {
        display: block;
        visibility: visible;
        opacity: 1;
      }
      
      .nft-product .woocommerce-product-gallery {
        display: block;
      }

      .nft-title-info {
        display: block;
        visibility: visible;
        opacity: 1;
        order: 1;
      }

      .nft-stock-status {
        display: block;
        font-weight: bold;
        font-size: 0.92em;
      }

      .nft-mint-date {
        display: block;
        color: #999;
      }

      .woocommerce div.product p.stock {
        font-size: 0.92em;
      }

      .product .summary {
        display: flex;
        flex-direction: column;
      }

      .product .summary .product_title {
        order: 0;
      }

      .product .summary .nft-title-info {
        order: 1;
      }

      .product .summary .price {
        order: 2;
      }

      .product .summary .nft-wallet-section {
        order: 3;
      }

      #persistent-view-content-button {
        display: block;
        visibility: visible;
        opacity: 1;
      }

      .nft-minted #persistent-view-content-button {
        display: block;
        visibility: visible;
        opacity: 1;
      }

      #solana-nft-header {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        text-align: left !important;
        margin: 15px 0 10px 0 !important;
        font-size: 16px !important;
        font-weight: bold !important;
        color: #333 !important;
        z-index: 999 !important;
      }

      #connected-wallet-info,
      #nft-ownership-message,
      #persistent-view-content-button,
      #always-visible-nft-info {
        background: #ffffff;
        border: 1px solid #b9b9b9;
        border-radius: 10px;
        padding: 12px;
        margin: 10px 0;
        font-size: 14px;
        text-align: left;
      }

      .wrong-wallet-message {
        background: #ff00001f !important;
        border: 1px solid #ff0000 !important;
        color: #000000 !important;
        padding: 15px !important;
        border-radius: 8px !important;
        margin: 10px 0 !important;
        text-align: center !important;
      }

      .stock.mintable-status {
        color: #28a745 !important;
        font-weight: bold !important;
        font-size: 0.92em !important;
      }

      .stock.minted-status {
        color: #dc3545 !important;
        font-weight: bold !important;
        font-size: 0.92em !important;
      }

      .woocommerce div.product p.stock {
        font-size: 0.92em !important;
        font-weight: bold !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
    `)
          .appendTo("head")
      } catch (error) {
        console.error("❌ Error in fixProductImageDisplay:", error)
      }
    }

    function initializeWalletConnections() {
      try {
        $(document).off("click", "#wallet-connect-button")
        $(document).off("click", "#pay-with-sol")
        $(document).off("click", "#disconnect-wallet")
        $(document).off("click", "#view-content-button")

        $(document).on("click", "#wallet-connect-button", (e) => {
          e.preventDefault()
          e.stopImmediatePropagation()

          if (isConnectingWallet || modalShown) {
            console.log("⚠️ Already connecting wallet or modal shown, ignoring click")
            return false
          }

          showWalletConnectionModal()
          return false
        })

        $(document).on("click", "#pay-with-sol", async (e) => {
          e.preventDefault()
          e.stopImmediatePropagation()

          console.log("💰 Pay with SOL clicked")

          if (isProcessingPayment) {
            console.log("⚠️ Payment already in progress")
            return false
          }

          if (isConnectingWallet || modalShown) {
            console.log("⚠️ Wallet connection in progress")
            return false
          }

          if (!connectedWallet) {
            console.log("🔗 No wallet connected, showing connection modal")
            showWalletConnectionModal()
            return false
          }

          await processSOLPayment()
          return false
        })

        $(document).on("click", "#disconnect-wallet", (e) => {
          e.preventDefault()
          e.stopImmediatePropagation()
          console.log("🔌 Disconnect wallet clicked")
          disconnectWallet()
          return false
        })

        $(document).on("click", "#view-content-button", (e) => {
          e.preventDefault()
          e.stopImmediatePropagation()
          console.log("👁️ View Content clicked")
          scrollToGatedContent()
          return false
        })
      } catch (error) {
        console.error("❌ Error in initializeWalletConnections:", error)
      }
    }

    function showWalletConnectionModal() {
      try {
        if (isConnectingWallet || modalShown) {
          console.log("⚠️ Modal already shown or connecting")
          return
        }

        isConnectingWallet = true
        modalShown = true
        $("#wallet-modal").remove()

        const modal = $(`
   <div id="wallet-modal" class="wallet-modal" style="
     position: fixed; 
     z-index: 999999; 
     left: 0; 
     top: 0; 
     width: 100%; 
     height: 100%; 
     background-color: rgba(0,0,0,0.8);
     display: flex;
     align-items: center;
     justify-content: center;
   ">
     <div class="wallet-modal-content" style="
       background: white; 
       padding: 30px; 
       border-radius: 10px; 
       text-align: center;
       max-width: 400px;
       width: 90%;
       position: relative;
       box-shadow: 0 10px 30px rgba(0,0,0,0.3);
       border: none;
     ">
       <span class="close" style="
         position: absolute; 
         right: 15px; 
         top: 15px; 
         font-size: 28px; 
         cursor: pointer;
         color: #999;
       ">&times;</span>
       <p style="margin-top: 5px; margin-bottom: 5px; font-weight: bold; font-size: 18px; color: #333;">NFT Mint Unlocks Hidden Content</p>
       <p>Choose your Solana wallet:</p>
       <div class="wallet-options" style="margin-top: 20px;">
         <button id="modal-phantom" class="wallet-option" style="
           display: block; 
           width: 100%; 
           padding: 15px; 
           margin: 10px 0; 
           background: #AB9FF2; 
           color: white; 
           border: none; 
           border-radius: 5px; 
           cursor: pointer;
           font-size: 16px;
           font-weight: bold;
         ">Phantom Wallet</button>
         <a href="https://phantom.app/download" target="_blank" style="display:block; text-align:center; font-size:12px; margin-top:4px;">Download Phantom</a>
         <button id="modal-backpack" class="wallet-option" style="
           display: block; 
           width: 100%; 
           padding: 15px; 
           margin: 10px 0; 
           background: #E33E3F; 
           color: white; 
           border: none; 
           border-radius: 5px; 
           cursor: pointer;
           font-size: 16px;
           font-weight: bold;
         ">Backpack Wallet</button>
         <a href="https://backpack.app/" target="_blank" style="display:block; text-align:center; font-size:12px; margin-top:4px;">Download Backpack</a>
       </div>
     </div>
   </div>
`)

        $("body").append(modal)

        $("#modal-phantom")
          .off("click")
          .on("click", (e) => {
            e.preventDefault()
            e.stopImmediatePropagation()
            closeModal()
            connectPhantomWallet()
          })

        $("#modal-backpack")
          .off("click")
          .on("click", (e) => {
            e.preventDefault()
            e.stopImmediatePropagation()
            closeModal()
            connectBackpackWallet()
          })

        $(".close")
          .off("click")
          .on("click", (e) => {
            e.preventDefault()
            e.stopImmediatePropagation()
            closeModal()
          })

        $("#wallet-modal")
          .off("click")
          .on("click", (e) => {
            if (e.target.id === "wallet-modal") {
              closeModal()
            }
          })
      } catch (error) {
        console.error("❌ Error in showWalletConnectionModal:", error)
      }
    }

    function closeModal() {
      try {
        $("#wallet-modal").remove()
        isConnectingWallet = false
        modalShown = false
      } catch (error) {
        console.error("❌ Error in closeModal:", error)
      }
    }

    async function connectPhantomWallet() {
      try {
        if (typeof window.solana === "undefined") {
          window.alert("Phantom wallet not found. Please install Phantom wallet extension.")
          return
        }

        console.log("🟣 Connecting to Phantom...")
        const response = await window.solana.connect()
        const publicKey = response.publicKey.toString()

        connectedWallet = publicKey
        walletType = "phantom"
        updateWalletUI(publicKey, "phantom")

        const productId = getProductId()
        if (productId) {
          setTimeout(() => {
            checkNFTOwnership(publicKey, productId)
          }, 500)
        }
      } catch (error) {
        console.error("❌ Error connecting to Phantom:", error)
        window.alert("Failed to connect to Phantom wallet.")
      }
    }

    async function connectBackpackWallet() {
      try {
        if (typeof window.backpack === "undefined") {
          window.alert("Backpack wallet not found. Please install Backpack wallet extension.")
          return
        }

        console.log("🎒 Connecting to Backpack...")
        const response = await window.backpack.connect()
        const publicKey = response.publicKey.toString()

        connectedWallet = publicKey
        walletType = "backpack"
        updateWalletUI(publicKey, "backpack")

        const productId = getProductId()
        if (productId) {
          setTimeout(() => {
            checkNFTOwnership(publicKey, productId)
          }, 500)
        }
      } catch (error) {
        console.error("❌ Error connecting to Backpack:", error)
        window.alert("Failed to connect to Backpack wallet.")
      }
    }

    function updateWalletUI(walletAddress, type) {
      try {
        const shortAddress = walletAddress.substring(0, 4) + "..." + walletAddress.substring(walletAddress.length - 4)

        $("#wallet-connect-button").hide()
        $(".nft-wallet-connect-message").hide()

        $("#connected-wallet-info").remove()
        $("[id*='connected']").remove()

        const connectedInfo = $(`
<div id="connected-wallet-info" style="
  background: #dddddd;
  border: 1px solid #b9b9b9;
  border-radius: 10px;
  padding: 12px;
  margin: 10px 0;
  font-size: 12px;
  text-align: left;
">
  <div style="margin-bottom: 8px; font-weight: bold; color: #155724;">
    Connected Wallet Address: 
    <span style="font-family: monospace; font-size: 12px;">${shortAddress}</span>
  </div>
  <div style="margin-bottom: 8px; color: #155724;">
    <strong>Type:</strong> ${type.charAt(0).toUpperCase() + type.slice(1)}
  </div>
  <button id="disconnect-wallet" style="
    background: #dc3545;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
  ">
    Disconnect
  </button>
</div>
`)

        if ($("#wallet-connect-button").length) {
          $("#wallet-connect-button").after(connectedInfo)
        } else if ($(".nft-wallet-section").length) {
          $(".nft-wallet-section").append(connectedInfo)
        } else {
          $("#solana-nft-header").after(connectedInfo)
        }

        $("body").addClass("wallet-connected")
        $(document).trigger("wallet_connected", [walletAddress])

        console.log("✅ Wallet UI updated")
      } catch (error) {
        console.error("❌ Error in updateWalletUI:", error)
      }
    }

    function disconnectWallet() {
      try {
        console.log("🔌 Disconnecting wallet...")

        if (window.solana && window.solana.isConnected) {
          window.solana.disconnect()
        }
        if (window.backpack && window.backpack.isConnected) {
          window.backpack.disconnect()
        }

        connectedWallet = null
        walletType = null
        isProcessingPayment = false
        isConnectingWallet = false
        modalShown = false

        $("#connected-wallet-info").remove()
        $("#nft-ownership-message").remove()
        $("#permanent-nft-ownership-display").remove()
        $("#magic-eden-link").remove()
        $("[id*='ownership']").remove()
        $("[id*='connected']").remove()
        $(".nft-success-message").remove()
        $(".nft-ownership").remove()
        $("[class*='ownership']").remove()
        $(".wrong-wallet-message").remove()

        $("#wallet-connect-button").show()
        $(".nft-wallet-connect-message").show()
        $("#payment-section").hide()
        $("body").removeClass("wallet-connected")

        lockGatedContent()
        $(document).trigger("wallet_disconnected")

        console.log("✅ Wallet disconnected with ultimate cleanup")
      } catch (error) {
        console.error("❌ Error in disconnectWallet:", error)
      }
    }

    function initializeStockStatus() {
      try {
        const stockElement = $(".stock")
        if (stockElement.length) {
          const stockText = stockElement.text().toLowerCase()
          const productId = getProductId()

          if (productId) {
            $.ajax({
              url: solana_nft_ajax.ajax_url,
              type: "POST",
              data: {
                action: "check_nft_ownership",
                wallet_address: "dummy",
                product_id: productId,
                nonce: solana_nft_ajax.nonce,
              },
              dataType: "json",
              success: (response) => {
                try {
                  if (response && response.success && response.data) {
                    const ownerWallet = response.data.owner_wallet
                    const mintAddress = response.data.mint_address
                    const nftExists = ownerWallet && mintAddress && mintAddress !== "Unknown"

                    if (nftExists) {
                      stockElement.text("Minted NFT on Solana").removeClass("mintable-status").addClass("minted-status")
                      console.log("✅ Initial status: NFT is minted")
                    } else {
                      stockElement
                        .text("Mintable NFT on Solana")
                        .removeClass("minted-status")
                        .addClass("mintable-status")
                      console.log("✅ Initial status: NFT is mintable")
                    }
                  } else {
                    stockElement.text("Mintable NFT on Solana").removeClass("minted-status").addClass("mintable-status")
                    console.log("✅ Initial status: Default to mintable")
                  }
                } catch (error) {
                  console.error("❌ Error processing initial stock status:", error)
                  if (stockText.includes("in stock") || stockText.includes("instock")) {
                    stockElement.text("Mintable NFT on Solana").addClass("mintable-status")
                  } else if (stockText.includes("out of stock") || stockText.includes("outofstock")) {
                    stockElement.text("Minted NFT on Solana").addClass("minted-status")
                  }
                }
              },
              error: (xhr, status, error) => {
                console.log("⚠️ Initial stock status check failed, using fallback")
                if (stockText.includes("in stock") || stockText.includes("instock")) {
                  stockElement.text("Mintable NFT on Solana").addClass("mintable-status")
                } else if (stockText.includes("out of stock") || stockText.includes("outofstock")) {
                  stockElement.text("Minted NFT on Solana").addClass("minted-status")
                }
              },
            })
          } else {
            if (stockText.includes("in stock") || stockText.includes("instock")) {
              stockElement.text("Mintable NFT on Solana").addClass("mintable-status")
            } else if (stockText.includes("out of stock") || stockText.includes("outofstock")) {
              stockElement.text("Minted NFT on Solana").addClass("minted-status")
            }
          }
        }
      } catch (error) {
        console.error("❌ Error in initializeStockStatus:", error)
      }
    }

    function moveDescriptionAndStatus() {
      try {
        setTimeout(() => {
          try {
            const shortDescription = $(".woocommerce-product-details__short-description")
            const productTitle = $(".product_title, .entry-title, h1.product_title")
            const stockElement = $(".stock")
            const walletSection = $(".nft-wallet-section")

            console.log("🔍 Found elements:", {
              shortDescription: shortDescription.length,
              productTitle: productTitle.length,
              stockElement: stockElement.length,
              walletSection: walletSection.length,
            })

            if (shortDescription.length && productTitle.length) {
              $(".nft-title-info").remove()

              const descriptionContainer = $(`
          <div class="nft-title-info" style="
            margin: 15px 0 20px 0;
            padding: 0;
            display: block;
            visibility: visible;
            opacity: 1;
            order: 1;
          ">
          </div>
        `)

              const clonedDescription = shortDescription.clone()
              clonedDescription.css({
                margin: "0 0 10px 0",
                "font-size": "16px",
                "line-height": "1.6",
                color: "#666",
                display: "block",
                visibility: "visible",
                opacity: "1",
              })

              descriptionContainer.append(clonedDescription)

              if (stockElement.length) {
                const stockText = stockElement.text()
                const isMinted = stockText.toLowerCase().includes("minted")

                const stockStatus = $(`
            <div class="nft-stock-status" style="
              font-weight: bold;
              font-size: 0.92em;
              color: ${isMinted ? "#dc3545" : "#28a745"};
              margin: 8px 0;
              display: block;
              visibility: visible;
              opacity: 1;
            ">
              ${stockText}
            </div>
          `)

                descriptionContainer.append(stockStatus)
              }

              addMintDateToTitle(descriptionContainer)
              productTitle.after(descriptionContainer)

              if (walletSection.length) {
                walletSection.before(descriptionContainer)
              }

              shortDescription.hide()

              console.log("✅ Moved description and status under product title and above wallet section")
            } else {
              console.log("❌ Could not find required elements for positioning")
            }
          } catch (error) {
            console.error("❌ Error in moveDescriptionAndStatus timeout:", error)
          }
        }, 1200)
      } catch (error) {
        console.error("❌ Error in moveDescriptionAndStatus:", error)
      }
    }

    function addMintDateToTitle(container) {
      try {
        const productId = getProductId()
        if (!productId) return

        $.ajax({
          url: solana_nft_ajax.ajax_url,
          type: "POST",
          data: {
            action: "get_nft_mint_date",
            product_id: productId,
            nonce: solana_nft_ajax.nonce,
          },
          dataType: "json",
          success: (response) => {
            try {
              if (response && response.success && response.data.mint_date) {
                const mintDate = new Date(response.data.mint_date)
                const formattedDate = `${mintDate.getMonth() + 1}/${mintDate.getDate()}/${mintDate.getFullYear().toString().slice(-2)}`

                const mintDateElement = $(`
                  <div class="nft-mint-date" style="
                    font-size: 13px;
                    color: #999;
                    margin: 5px 0 0 0;
                    display: block;
                    visibility: visible;
                    opacity: 1;
                  ">
                    Minted: ${formattedDate}
                  </div>
                `)

                container.append(mintDateElement)
                console.log("✅ Added mint date to title area:", formattedDate)
              }
            } catch (error) {
              console.error("❌ Error processing mint date response:", error)
            }
          },
          error: (xhr, status, error) => {
            console.error("❌ Error fetching mint date:", error)
          },
        })
      } catch (error) {
        console.error("❌ Error in addMintDateToTitle:", error)
      }
    }

    function hideAddToCartButton() {
      try {
        const isNFTProduct = $("body").hasClass("nft-product") || $(".nft-wallet-section").length > 0
        if (isNFTProduct) {
          $(".single_add_to_cart_button").hide()
          $("form.cart").hide()
        }
      } catch (error) {
        console.error("❌ Error in hideAddToCartButton:", error)
      }
    }

    async function calculateSOLPrice() {
      try {
        const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
        const data = await response.json()
        const solPrice = data.solana.usd
        currentSOLPrice = solPrice

        let productPrice = 69.0
        if ($(".woocommerce-Price-amount").length) {
          const priceText = $(".woocommerce-Price-amount").first().text()
          const priceMatch = priceText.match(/[\d,.]+/)
          if (priceMatch) {
            productPrice = Number.parseFloat(priceMatch[0].replace(/[^\d.]/g, ""))
          }
        }

        const solAmount = (productPrice / solPrice).toFixed(4)

        if (!$(".sol-price-display").length) {
          const priceDisplay = $(`
          <div class="sol-price-display" style="
            font-size: 18px;
            font-weight: 700;
            color: #000;
            margin: 15px 0;
            text-align: center;
            background: #f8f9fa00;
            padding: 15px;
            border-radius: 8px;
          ">
            Price: ${solAmount} SOL<br>
            <small style="font-size: 14px; color: #666;">≈ $${productPrice} USD</small>
          </div>
        `)

          if ($("#pay-with-sol").length) {
            $("#pay-with-sol").before(priceDisplay)
          } else if ($(".nft-wallet-section").length) {
            $(".nft-wallet-section").append(priceDisplay)
          }
        } else {
          $(".sol-price-display").html(`
          Price: ${solAmount} SOL<br>
          <small style="font-size: 14px; color: #666;">≈ $${productPrice} USD</small>
        `)
        }

        console.log(`✅ SOL price updated: ${solAmount} SOL ≈ $${productPrice} USD`)
      } catch (error) {
        console.error("❌ Error calculating SOL price:", error)

        if (!$(".sol-price-display").length) {
          const priceDisplay = $(`
          <div class="sol-price-display" style="
            font-size: 18px;
            font-weight: 700;
            color: #000;
            margin: 15px 0;
            text-align: center;
            background: #f9f9f9;
            padding: 15px;
            border-radius: 8px;
          ">
            Price: 0.46 SOL<br>
            <small style="font-size: 14px; color: #666;">≈ $69 USD</small>
          </div>
        `)

          if ($("#pay-with-sol").length) {
            $("#pay-with-sol").before(priceDisplay)
          } else if ($(".nft-wallet-section").length) {
            $(".nft-wallet-section").append(priceDisplay)
          }
        } else {
          $(".sol-price-display").html("Price: 0.46 SOL<br><small>≈ $69 USD</small>")
        }
      }
    }

    // COMPLETELY REWRITTEN PAYMENT FUNCTION - NO DIRECT RPC CALLS
    async function processSOLPayment() {
      try {
        isProcessingPayment = true

        if (
          !solana_nft_ajax ||
          !solana_nft_ajax.ajax_url ||
          !solana_nft_ajax.nonce ||
          !solana_nft_ajax.merchant_wallet
        ) {
          throw new Error("Configuration error. Please refresh the page.")
        }

        let productPrice = 0
        if ($(".woocommerce-Price-amount").length) {
          const priceText = $(".woocommerce-Price-amount").first().text()
          const priceMatch = priceText.match(/[\d,.]+/)
          if (priceMatch) {
            productPrice = Number.parseFloat(priceMatch[0].replace(/[^\d.]/g, ""))
          }
        }

        if (isNaN(productPrice) || productPrice <= 0) {
          productPrice = 69.0
        }

        const solAmount = (productPrice / currentSOLPrice).toFixed(4)

        // Enhanced button feedback
        $("#pay-with-sol")
          .prop("disabled", true)
          .html(`
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <span style="width: 16px; height: 16px; border: 2px solid #fff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></span>
        Processing Payment...
      </span>
    `)

        // Add spinner animation
        if (!$("#payment-spinner-style").length) {
          $("head").append(`
        <style id="payment-spinner-style">
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `)
        }

        const productId = getProductId()
        if (!productId) {
          throw new Error("Could not determine product ID")
        }

        console.log("💰 Creating SOL payment transaction...")
        console.log(`   - Amount: ${solAmount} SOL ($${productPrice} USD)`)
        console.log(`   - Product ID: ${productId}`)
        console.log(`   - Wallet: ${connectedWallet}`)

        // Show user what's happening
        const statusMessage = $(`
      <div id="payment-status" style="
        background: #e3f2fd;
        border: 1px solid #2196f3;
        border-radius: 8px;
        padding: 12px;
        margin: 10px 0;
        font-size: 14px;
        text-align: center;
      ">
        🔄 Step 1/4: Getting blockchain data from bridge server...
      </div>
    `)
        $("#pay-with-sol").after(statusMessage)

        // Get blockhash from bridge server - NO DIRECT RPC CALLS
        console.log("🔄 Getting blockhash from bridge server...")
        const blockhashResponse = await fetch("https://sol-server-bridge-mainnet.vercel.app/api/blockhash")

        if (!blockhashResponse.ok) {
          throw new Error(`Bridge server error: ${blockhashResponse.status}`)
        }

        const blockhashData = await blockhashResponse.json()

        if (!blockhashData.success) {
          throw new Error("Failed to get blockhash from bridge server: " + blockhashData.error)
        }

        const { blockhash } = blockhashData

        console.log("✅ Got blockhash from bridge server:", blockhash)

        // Create transaction with bridge server blockhash - NO CONNECTION OBJECT
        $("#payment-status").html("🔄 Step 2/4: Creating transaction...")

        const transaction = new solanaWeb3.Transaction()
        const recipientPubkey = new solanaWeb3.PublicKey(solana_nft_ajax.merchant_wallet)
        const senderPubkey = new solanaWeb3.PublicKey(connectedWallet)

        const lamports = Math.floor(Number.parseFloat(solAmount) * solanaWeb3.LAMPORTS_PER_SOL)

        transaction.add(
          solanaWeb3.SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: recipientPubkey,
            lamports: lamports,
          }),
        )

        // Set blockhash and fee payer - NO CONNECTION CALLS
        transaction.recentBlockhash = blockhash
        transaction.feePayer = senderPubkey

        console.log("✅ Transaction created with bridge server blockhash")

        $("#payment-status").html("✍️ Step 3/4: Please sign in your wallet...")

        let signedTransaction
        if (walletType === "phantom" && window.solana) {
          signedTransaction = await window.solana.signTransaction(transaction)
        } else if (walletType === "backpack" && window.backpack) {
          signedTransaction = await window.backpack.signTransaction(transaction)
        } else {
          throw new Error("No compatible wallet found")
        }

        $("#payment-status").html("📡 Step 4/4: Broadcasting to Solana network...")

        // Send to bridge server - NO DIRECT RPC CALLS
        const sendResponse = await fetch("https://sol-server-bridge-mainnet.vercel.app/api/send-tx", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signedTx: signedTransaction.serialize().toString("base64"),
          }),
        })

        if (!sendResponse.ok) {
          throw new Error(`Bridge server error: ${sendResponse.status}`)
        }

        const sendResult = await sendResponse.json()

        if (!sendResult.success) {
          throw new Error("Transaction failed: " + sendResult.error)
        }

        const signature = sendResult.signature

        if (processedTransactions.has(signature)) {
          throw new Error("Transaction already processed")
        }
        processedTransactions.add(signature)

        $("#payment-status").html("⏳ Confirming transaction on blockchain...")

        console.log("✅ Transaction sent successfully! Signature:", signature)

        $("#payment-status").html("🎨 Payment confirmed! Minting your NFT...")

        console.log("✅ Transaction confirmed! Minting NFT with DIRECT MINTING...")

        // Call bridge server directly
        const bridgeResponse = await fetch('https://sol-server-bridge-mainnet.vercel.app/api/mint-nft', {
        method: 'POST',
        headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    walletAddress: connectedWallet,
    metadata: {
      name: 'NFT from WordPress',
      description: 'Minted via WordPress store',
      image: '',
      attributes: [
        { trait_type: 'Product ID', value: productId.toString() },
        { trait_type: 'Transaction', value: signature },
        { trait_type: 'Minted Date', value: new Date().toISOString() }
      ]
    }
  })
});
// FIXED: Properly declare response variable
        let response;
        if (bridgeResponse.ok) {
          response = await bridgeResponse.json();
          console.log("🎨 NFT Minting Response:", response);
          
          // Convert bridge response to WordPress format
          if (response.success) {
            response.data = {
              mint_address: response.mintAddress,
              transaction_signature: response.transactionSignature,
              message: response.message
            };
          }
        } else {
          response = { 
            success: false, 
            data: `HTTP ${bridgeResponse.status}: ${await bridgeResponse.text()}`
          };
        }

        $("#payment-status").remove()

        if (response && response.success) {
          const mintAddress = response.data.mint_address || response.data.mintAddress
          const successMessage = $('<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: green; color: white; padding: 30px; z-index: 999999;">🎉 REAL NFT MINTED! 🎉</div>')
          $("body").append(successMessage)
          setTimeout(() => successMessage.remove(), 3000)
          await updateAfterSuccessfulMint(mintAddress, connectedWallet)
        } else {
          throw new Error(response.data || "Minting failed")
        }
        console.log("🎨 NFT Minting Response:", response)

        $("#payment-status").remove()

        if (response && response.success) {
          const mintAddress = response.data.mint_address || response.data.mintAddress

          if (mintAddress && mintAddress.startsWith("DEMO")) {
            window.alert("⚠️ NFT minted in DEMO mode. Bridge server may have issues.")
          } else {
            // Success notification with confetti effect
            const successMessage = $(`
          <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            z-index: 999999;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            font-size: 18px;
            font-weight: bold;
          ">
            🎉 NFT MINTED SUCCESSFULLY! 🎉<br>
            <small style="font-size: 14px; margin-top: 10px; display: block;">
              Your exclusive content is now unlocked!
            </small>
          </div>
        `)

            $("body").append(successMessage)

            setTimeout(() => {
              successMessage.fadeOut(500, () => successMessage.remove())
            }, 3000)
          }

          await updateAfterSuccessfulMint(mintAddress, connectedWallet)
        } else {
          const errorMsg = response.data || response.message || "Minting failed"
          console.error("❌ Minting error:", errorMsg)
          throw new Error(errorMsg)
        }
      } catch (error) {
        console.error("❌ Payment error:", error)

        $("#payment-status").remove()

        let errorMessage = error.message || "Unknown error occurred"
        let productPrice = 0
        if ($(".woocommerce-Price-amount").length) {
          const priceText = $(".woocommerce-Price-amount").first().text()
          const priceMatch = priceText.match(/[\d,.]+/)
          if (priceMatch) {
            productPrice = Number.parseFloat(priceMatch[0].replace(/[^\d.]/g, ""))
          }
        }

        // Enhanced error messages
        if (errorMessage.includes("Bridge server error: 500")) {
          errorMessage = "Bridge server error (500). Please check server configuration."
        } else if (errorMessage.includes("already been processed")) {
          errorMessage = "Transaction already processed. Please refresh the page."
        } else if (errorMessage.includes("insufficient funds")) {
          errorMessage = `Insufficient SOL balance. You need at least ${(productPrice / currentSOLPrice).toFixed(4)} SOL.`
        } else if (errorMessage.includes("User rejected")) {
          errorMessage = "Transaction was cancelled by user."
        } else if (errorMessage.includes("Confirmation timeout")) {
          errorMessage = "Transaction is taking longer than expected. Please check your wallet or try again."
        } else if (errorMessage.includes("Blockhash not found")) {
          errorMessage = "Network timing issue. Please try again in a few seconds."
        } else if (errorMessage.includes("403") || errorMessage.includes("Access forbidden")) {
          errorMessage = "RPC access issue resolved - using bridge server. Please try again."
        }

        // Show error in a nice format
        const errorDiv = $(`
      <div style="
        background: #ffebee;
        border: 1px solid #f44336;
        border-radius: 8px;
        padding: 15px;
        margin: 10px 0;
        color: #c62828;
        text-align: center;
        font-weight: bold;
      ">
        ${errorMessage}
      </div>
    `)

        $("#pay-with-sol").after(errorDiv)

        setTimeout(() => {
          errorDiv.fadeOut(500, () => errorDiv.remove())
        }, 5000)

        $("#pay-with-sol").prop("disabled", false).text("Pay with SOL & Mint NFT")
      } finally {
        isProcessingPayment = false
      }
    }

    async function updateAfterSuccessfulMint(mintAddress, ownerWallet) {
      try {
        console.log("🎉 Updating UI after successful mint...")

        $("#nft-ownership-message").remove()
        $("#permanent-nft-ownership-display").remove()
        $("[id*='ownership']").remove()
        $(".nft-success-message").remove()
        $("[class*='ownership']").remove()

        $("#solana-nft-header").text("NFT Owner Unlocks Hidden Content")
        $(".nft-stock-status").text("Minted NFT on Solana").css("color", "#dc3545")

        const today = new Date().toLocaleDateString("en-US", {
          year: "2-digit",
          month: "numeric",
          day: "numeric",
        })

        if (!$(".nft-mint-date").length) {
          const mintDateElement = $(`
            <div class="nft-mint-date" style="
              font-size: 13px;
              color: #999;
              margin: 5px 0 0 0;
              display: block;
              visibility: visible;
              opacity: 1;
            ">
              Minted: ${today}
            </div>
          `)
          $(".nft-title-info").append(mintDateElement)
        }

        $("#payment-section").hide()
        $(".woocommerce-Price-amount").parent().hide()

        const stockElement = $(".stock")
        if (stockElement.length) {
          stockElement.text("Minted NFT on Solana").removeClass("mintable-status").addClass("minted-status")
        }

        const shortOwner = ownerWallet.substring(0, 4) + "..." + ownerWallet.substring(ownerWallet.length - 3)
        const shortMint =
          mintAddress && mintAddress.length > 10
            ? mintAddress.substring(0, 4) + "..." + mintAddress.substring(mintAddress.length - 4)
            : mintAddress || "Unknown"

        const isMainnet = solana_nft_ajax.network === "mainnet-beta"
        const network = isMainnet ? "" : "?cluster=devnet"
        const explorerUrl = `https://explorer.solana.com/address/${mintAddress}${network}`

        const ownershipMessage = $(`
<div id="nft-ownership-message" style="
background: #dddddd;
border: 1px solid #b9b9b9;
border-radius: 10px;
padding: 12px;
margin: 10px 0;
font-size: 12px;
text-align: left;
">
<div style="margin-bottom: 6px;">
 <strong>Owned by:</strong> 
 <span style="font-family: monospace; color: #155724;">${shortOwner}</span>
</div>
<div style="color: #666; margin-bottom: 6px;">
 <strong>NFT Address:</strong> 
 <a href="${explorerUrl}" target="_blank" rel="noopener" style="
   color: #007bff;
   text-decoration: none;
   font-family: monospace;
 " onmouseover="this.style.textDecoration='underline'" 
    onmouseout="this.style.textDecoration='none'">
   ${shortMint}
 </a>
</div>
<div style="color: #666; margin-bottom: 8px;">
 <strong>Minted:</strong> <span style="font-weight: bold; color: #dc3545;">${today}</span>
</div>
<div style="text-align: left; margin-bottom: 10px;">
 <a href="https://magiceden.io/item-details/${mintAddress}" target="_blank" rel="noopener" style="
   color: #e60012;
   text-decoration: underline;
   font-weight: bold;
   font-size: 12px;
 ">
   View on Magic Eden
 </a>
</div>
<div style="text-align: center; margin-top: 10px;">
 <button id="view-content-button" style="
   background: linear-gradient(135deg, #000000, #000000);
   color: white;
   border: none;
   padding: 10px 20px;
   border-radius: 5px;
   cursor: pointer;
   font-size: 14px;
   font-weight: bold;
   width: 100%;
 ">
   View Exclusive Content
 </button>
</div>
</div>
`)

        if ($("#connected-wallet-info").length) {
          $("#connected-wallet-info").after(ownershipMessage)
        } else if ($(".nft-wallet-section").length) {
          $(".nft-wallet-section").append(ownershipMessage)
        } else {
          $("#solana-nft-header").after(ownershipMessage)
        }

        unlockGatedContent()
        $("body").addClass("nft-minted")

        console.log("✅ UI updated after successful mint")
      } catch (error) {
        console.error("❌ Error in updateAfterSuccessfulMint:", error)
      }
    }

    function checkCurrentNFTStatus() {
      try {
        const productId = getProductId()
        if (!productId) return

        $.ajax({
          url: solana_nft_ajax.ajax_url,
          type: "POST",
          data: {
            action: "check_nft_status",
            product_id: productId,
            nonce: solana_nft_ajax.nonce,
          },
          dataType: "json",
          success: (response) => {
            try {
              if (response && response.success && response.data.is_minted) {
                $("#solana-nft-header").text("NFT Owner Unlocks Hidden Content")
                $(".nft-stock-status").text("Minted NFT on Solana").css("color", "#dc3545")

                const stockElement = $(".stock")
                if (stockElement.length) {
                  stockElement.text("Minted NFT on Solana").removeClass("mintable-status").addClass("minted-status")
                }

                $("#payment-section").hide()
                $(".woocommerce-Price-amount").parent().hide()

                if (!$("#persistent-view-content-button").length) {
                  const viewContentButton = $(`
<div id="persistent-view-content-button" style="
background: #dddddd;
border: 1px solid #b9b9b9;
border-radius: 10px;
padding: 12px;
margin: 10px 0;
font-size: 12px;
text-align: center;
">
<button id="view-content-button" style="
 background: linear-gradient(135deg, #000000, #000000);
 color: white;
 border: none;
 padding: 12px 24px;
 border-radius: 5px;
 cursor: pointer;
 font-size: 14px;
 font-weight: bold;
 width: 100%;
">
 View Exclusive Content
</button>
</div>
`)

                  if ($(".nft-wallet-section").length) {
                    $(".nft-wallet-section").after(viewContentButton)
                  } else if ($("#solana-nft-header").length) {
                    $("#solana-nft-header").after(viewContentButton)
                  } else {
                    $(".product .summary").append(viewContentButton)
                  }
                }

                $("body").addClass("nft-minted")
              }
            } catch (error) {
              console.error("❌ Error processing NFT status response:", error)
            }
          },
          error: (xhr, status, error) => {
            console.error("❌ Error checking NFT status:", error)
          },
        })
      } catch (error) {
        console.error("❌ Error in checkCurrentNFTStatus:", error)
      }
    }

    function initializeGatedContent() {
      try {
        if ($(".nft-gated-content").length > 0) {
          console.log("🔒 Gated content found, initializing...")

          lockGatedContent()

          $(".nft-gated-content").each(function () {
            if (!$(this).find(".nft-gated-message").length) {
              $(this).prepend(`
                <div class="nft-gated-message">
                  <span class="lock-icon"></span>
                  This content is exclusive to NFT holders
                </div>
              `)
            }
          })
        }
      } catch (error) {
        console.error("❌ Error in initializeGatedContent:", error)
      }
    }

    function scrollToGatedContent() {
      try {
        const gatedContent = $(".nft-gated-content, .woocommerce-tabs, .woocommerce-product-details__short-description")

        if (gatedContent.length) {
          $("html, body").animate(
            {
              scrollTop: gatedContent.offset().top - 100,
            },
            800,
          )
          console.log("✅ Scrolled to gated content")
        } else {
          const descriptionArea = $(".woocommerce-tabs, #tab-description, .product-description")
          if (descriptionArea.length) {
            $("html, body").animate(
              {
                scrollTop: descriptionArea.offset().top - 100,
              },
              800,
            )
            console.log("✅ Scrolled to description area")
          }
        }
      } catch (error) {
        console.error("❌ Error in scrollToGatedContent:", error)
      }
    }

    async function checkNFTOwnership(walletAddress, productId) {
      try {
        console.log("🔍 STARTING NFT OWNERSHIP CHECK")
        console.log("   - Wallet:", walletAddress)
        console.log("   - Product ID:", productId)

        $("#nft-ownership-message").remove()
        $("#permanent-nft-ownership-display").remove()
        $("[id*='ownership']").remove()
        $("[class*='ownership']").remove()
        $(".wrong-wallet-message").remove()
        $("#payment-section").hide()
        $("#pay-with-sol").hide()
        $(".woocommerce-Price-amount").parent().hide()

        console.log("🧹 UI completely reset")

        const response = await $.ajax({
          url: solana_nft_ajax.ajax_url,
          type: "POST",
          data: {
            action: "check_nft_ownership",
            wallet_address: walletAddress,
            product_id: productId,
            nonce: solana_nft_ajax.nonce,
          },
          dataType: "json",
        })

        console.log("📡 SERVER RESPONSE:", response)

        if (response && response.success && response.data) {
          const ownerWallet = response.data.owner_wallet
          const mintAddress = response.data.mint_address || response.data.mintAddress
          const mintDate = response.data.mint_date

          console.log("📊 DETAILED OWNERSHIP STATUS:")
          console.log("   - Owner Wallet:", ownerWallet)
          console.log("   - Mint Address:", mintAddress)
          console.log("   - Connected Wallet:", walletAddress)
          console.log("   - Wallets Match:", walletAddress.toLowerCase() === ownerWallet?.toLowerCase())

          const nftExists = ownerWallet && mintAddress && mintAddress !== "Unknown"

          if (!nftExists) {
            console.log("✅ CASE 1: NFT not minted - showing payment")
            $("#payment-section").show()
            $("#pay-with-sol").show()
            $(".woocommerce-Price-amount").parent().show()
            lockGatedContent()
            return
          }

          const isOwner = walletAddress.toLowerCase() === ownerWallet.toLowerCase()

          if (isOwner) {
            console.log("✅ CASE 2A: Correct owner - showing ownership info")

            $("#solana-nft-header").text("NFT Owner Unlocks Hidden Content")
            $(".nft-stock-status").text("Minted NFT on Solana").css("color", "#dc3545")

            const stockElement = $(".stock")
            if (stockElement.length) {
              stockElement.text("Minted NFT on Solana").removeClass("mintable-status").addClass("minted-status")
            }

            showOwnershipInfoEnhanced(walletAddress, mintAddress, {
              mint_date: mintDate,
              owner_wallet: ownerWallet,
            })
            unlockGatedContent()
            updateUIForMintedNFT()
          } else {
            console.log("❌ CASE 2B: Wrong wallet connected")
            console.log("   - Expected:", ownerWallet)
            console.log("   - Connected:", walletAddress)

            showWrongWalletMessage(ownerWallet)
            lockGatedContent()

            $("#payment-section").hide()
            $("#pay-with-sol").hide()
            $(".woocommerce-Price-amount").parent().hide()
          }
        } else {
          console.log("⚠️ No valid response - defaulting to payment")
          $("#payment-section").show()
          $("#pay-with-sol").show()
          $(".woocommerce-Price-amount").parent().show()
          lockGatedContent()
        }
      } catch (error) {
        console.error("❌ OWNERSHIP CHECK ERROR:", error)

        $("#payment-section").show()
        $("#pay-with-sol").show()
        $(".woocommerce-Price-amount").parent().show()
        lockGatedContent()
      }
    }

    function showOwnershipInfoEnhanced(walletAddress, mintAddress, responseData) {
      try {
        console.log("🎉 Showing enhanced ownership info for verified owner")

        const mintDate = responseData.mint_date || responseData.created_at || new Date().toISOString()
        const formattedDate = new Date(mintDate).toLocaleDateString("en-US", {
          year: "2-digit",
          month: "numeric",
          day: "numeric",
        })

        const shortOwner = walletAddress.substring(0, 4) + "..." + walletAddress.substring(walletAddress.length - 3)

        const ownershipMessage = $(`
<div id="nft-ownership-message" style="
background: #dddddd;
border: 1px solid #b9b9b9;
border-radius: 10px;
padding: 12px;
margin: 10px 0;
font-size: 12px;
text-align: left;
">
<div style="margin-bottom: 6px;">
 <strong>✅ Hello Verified Owner:</strong> 
 <span style="font-family: monospace; color: #155724;">${shortOwner}</span>
</div>
<div style="color: #666; margin-bottom: 8px;">
 <strong>Minted:</strong> <span style="font-weight: bold; color: #dc3545;">${formattedDate}</span>
</div>
<div style="text-align: center; margin-top: 10px;">
 <button id="view-content-button" style="
   background: linear-gradient(135deg, #000000, #000000);
   color: white;
   border: none;
   padding: 10px 20px;
   border-radius: 5px;
   cursor: pointer;
   font-size: 14px;
   font-weight: bold;
   width: 100%;
 ">
   View Exclusive Content
 </button>
</div>
</div>
`)

        if ($("#connected-wallet-info").length) {
          $("#connected-wallet-info").after(ownershipMessage)
        } else if ($(".nft-wallet-section").length) {
          $(".nft-wallet-section").append(ownershipMessage)
        } else {
          $("#solana-nft-header").after(ownershipMessage)
        }

        $("body").addClass("nft-minted")
        console.log("✅ Enhanced ownership info displayed")
      } catch (error) {
        console.error("❌ Error in showOwnershipInfoEnhanced:", error)
      }
    }

    function showWrongWalletMessage(expectedWallet) {
      try {
        const shortExpected =
          expectedWallet.substring(0, 4) + "..." + expectedWallet.substring(expectedWallet.length - 4)

        const wrongWalletMessage = $(`
<div class="wrong-wallet-message" style="
background: #ff00001f !important;
border: 1px solid #ff0000 !important;
color: #000000 !important;
padding: 15px !important;
border-radius: 8px !important;
margin: 10px 0 !important;
text-align: center !important;
">
<div style="font-weight: bold; margin-bottom: 8px;">
 ❌ Wrong Wallet Connected
</div>
<div style="margin-bottom: 8px;">
 This NFT is owned by: <br>
 <span style="font-family: monospace; font-weight: bold;">${shortExpected}</span>
</div>
<div style="font-size: 12px; color: #666;">
 Please connect the correct wallet to access the content.
</div>
</div>
`)

        if ($("#connected-wallet-info").length) {
          $("#connected-wallet-info").after(wrongWalletMessage)
        } else if ($(".nft-wallet-section").length) {
          $(".nft-wallet-section").append(wrongWalletMessage)
        } else {
          $("#solana-nft-header").after(wrongWalletMessage)
        }

        console.log("❌ Wrong wallet message displayed")
      } catch (error) {
        console.error("❌ Error in showWrongWalletMessage:", error)
      }
    }

    function updateUIForMintedNFT() {
      try {
        $("#payment-section").hide()
        $("#pay-with-sol").hide()
        $(".woocommerce-Price-amount").parent().hide()

        const stockElement = $(".stock")
        if (stockElement.length) {
          stockElement.text("Minted NFT on Solana").removeClass("mintable-status").addClass("minted-status")
        }

        $("body").addClass("nft-minted")
        console.log("✅ UI updated for minted NFT")
      } catch (error) {
        console.error("❌ Error in updateUIForMintedNFT:", error)
      }
    }

    function lockGatedContent() {
      try {
        $(".nft-gated-content").addClass("locked")
        console.log("🔒 Locking gated content...")

        $(".nft-gated-content").each(function () {
          const $content = $(this)

          if (!$content.find(".nft-gated-overlay").length) {
            const overlay = $(`
              <div class="nft-gated-overlay" style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                border-radius: 8px;
              ">
                <div style="text-align: center; padding: 20px;">
                  <div style="font-size: 48px; margin-bottom: 10px;">🔒</div>
                  <div style="font-weight: bold; margin-bottom: 5px;">Exclusive Content</div>
                  <div style="font-size: 14px; color: #666;">NFT ownership required</div>
                </div>
              </div>
            `)

            $content.css("position", "relative").append(overlay)
          }
        })

        console.log("✅ Gated content locked")
      } catch (error) {
        console.error("❌ Error in lockGatedContent:", error)
      }
    }

    function unlockGatedContent() {
      try {
        console.log("🔓 Unlocking gated content...")
        $(".nft-gated-content").removeClass("locked")
        $(".nft-gated-overlay").remove()
        console.log("✅ Gated content unlocked")
      } catch (error) {
        console.error("❌ Error in unlockGatedContent:", error)
      }
    }

    function getProductId() {
      try {
        if (window.wc_single_product_params && window.wc_single_product_params.post_id) {
          return window.wc_single_product_params.post_id
        }

        const bodyClasses = document.body.className
        const postIdMatch = bodyClasses.match(/postid-(\d+)/)
        if (postIdMatch) {
          return postIdMatch[1]
        }

        const urlMatch = window.location.pathname.match(/\/product\/[^/]+\/(\d+)/)
        if (urlMatch) {
          return urlMatch[1]
        }

        const metaProductId = $('meta[name="product-id"]').attr("content")
        if (metaProductId) {
          return metaProductId
        }

        console.log("⚠️ Could not determine product ID")
        return null
      } catch (error) {
        console.error("❌ Error in getProductId:", error)
        return null
      }
    }


    // Fix header text on page load
    fixHeaderText()
    setInterval(fixHeaderText, 2000)
  })(jQuery)

  console.log("✅ Solana NFT Maker script loaded successfully")
}

// Final initialization
if (typeof jQuery !== "undefined") {
  jQuery(document).ready(() => {
    console.log("🚀 Solana NFT Maker script execution complete")
  })
} else {
  console.log("🚀 Solana NFT Maker script execution complete")
}


// Add Buffer polyfill at the very top
const { Buffer } = require('buffer');
if (typeof global !== 'undefined') {
  global.Buffer = Buffer;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    // Dynamic import
    const { Connection, clusterApiUrl } = await import("@solana/web3.js")
    
    // Environment variables with debugging
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))
    
    // Debug logging
    console.log("🔍 Using RPC URL:", SOLANA_RPC_URL);
    console.log("🔍 Network:", SOLANA_NETWORK);
    
    // Initialize connection with timeout
    const connection = new Connection(SOLANA_RPC_URL, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 30000
    })
    
    // Get latest blockhash with retry logic
    let blockhash;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const result = await connection.getLatestBlockhash("confirmed")
        blockhash = result.blockhash;
        break;
      } catch (error) {
        attempts++;
        console.log(`❌ Attempt ${attempts} failed:`, error.message);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log("✅ Latest blockhash:", blockhash)
    
    res.status(200).json({
      success: true,
      blockhash: blockhash,
      network: SOLANA_NETWORK,
      rpcUrl: SOLANA_RPC_URL
    })
    
  } catch (error) {
    console.error("❌ Blockhash error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    })
  }
}
